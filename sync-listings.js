const CLIENT_ID = '3MVG9Ve.2wqUVx_bJYpcLqDC5bMiXOH6ytcHMDDKZe4BfDF8.SS9hNrfOOvvruf0QhCQWpM2o3AqWU8S0Kf1N';
const REDIRECT_URI = 'https://www.ataloss.org/service-update'; // or your actual domain
const LOGIN_URL = 'https://login.salesforce.com';
const NUMBER_OF_CHANGES = 10;

let accessToken = null;
let instanceUrl = null;
let pendingUpdates = [];
let sfRecords = null;
let pendingArchive = [];

// Delete 'featured' array to free memory
delete window.sectionData['featured'];

////////////////////////////////////////////////////////
// STEP ONE
// listings without a CRM System ID
////////////////////////////////////////////////////////

// Filter, transform and separate invalid entries
function filterAndTransform(arr, removedItems) {
	return arr
		.map(item => {
			const title = item.title?.toLowerCase() || "";

			// Filter out items that contain "the bereavement journey"
			if (title.includes("the bereavement journey")) {
				return null;
			}

			// Filter out items without a salesforceId
			if (!item.salesforceId) {
				removedItems.push(item);
				return null;
			}

			return item;
		})
		.filter(Boolean); // Remove nulls
	}

function displayRemovedItems(removedItems,container) {

	const intro = document.createElement('p');
	intro.innerHTML = 'The first step is to make sure that all listings have an identifiable \
										 SalesForce system ID (15 alphanumeric characters), enclosed in square \
										 brackets and on a line of their own at the end of the listing body. \
										 These following listings (each clickable to edit) do not have their \
										 system ID and that needs to be added to all of these, before you can \
										 proceeed to the next step of the process. After updating the blog listings,\
										 don\'t forget to regenerate the cache and Ctrl Refresh this page, as this \
										 page is based on that cache.';
	container.appendChild(intro);
	
	const list = document.createElement('ul');

	// Sort by title (case-insensitive)
	removedItems.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

	removedItems.forEach(item => {
		const li = document.createElement('li');
		const link = document.createElement('a');
		link.href = item.fullUrl.replace('www.ataloss.org', 'ataloss.squarespace.com');;
		link.textContent = item.title;
		link.target = '_blank'; // open in new tab
		li.appendChild(link);
		list.appendChild(li);
	});

	container.appendChild(list);
}

// find listing that don't have a salesforce system ID
function missingSysids() {
	
	// Track removed entries (no Salesforce ID)
	const removedItems = [];

	// Process arrays
	console.log(window.sectionData['national'].length);
	
	const nationalFiltered = filterAndTransform(window.sectionData['national'], removedItems);
	console.log(removedItems.length);
	const regionalFiltered = filterAndTransform(window.sectionData['regional'], removedItems);
	console.log(removedItems.length);

	// Clean up original arrays to free memory
	window.sectionData['national'].length = 0;
	window.sectionData['regional'].length = 0;
	delete window.sectionData['national'];
	delete window.sectionData['regional'];
	
	// display any listings without a sys ID
	const container = document.getElementById('missing-sysids');
	container.style.display = 'block'; // make sure it's visible

	if (removedItems.length > 0) {
		displayRemovedItems(removedItems,container);
	} else {
		container.innerHTML = "<p>All good.</p>";
	}

	// Combine valid entries into one array
	window.combinedFiltered = [...nationalFiltered, ...regionalFiltered];
	console.log(`${window.combinedFiltered.length} non-TBJ blog listings found`);
	
	// Optional: Clear intermediate arrays
	nationalFiltered.length = 0;
	regionalFiltered.length = 0;
	
	return removedItems.length > 0;
}


////////////////////////////////////////////////////////
// CONNECT TO CRM
// oauth redirect, login and direct back
////////////////////////////////////////////////////////

// Parse access token from the URL after login redirect
function getTokenFromHash() {
	const hash = window.location.hash.substring(1);
	const params = new URLSearchParams(hash);
	return {
		accessToken: params.get('access_token'),
		instanceUrl: params.get('instance_url')
	};
}

// Perform login redirect
function loginWithSalesforce() {
	const authUrl = `${LOGIN_URL}/services/oauth2/authorize?response_type=token&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
	window.location.href = authUrl;
}


////////////////////////////////////////////////////////
// STEP TWO
// listings with a CRM System ID not found in the CRM
////////////////////////////////////////////////////////

const servicesSoql = `
	SELECT Id, Service_Listing_System_ID__c, Service_Listing_Name__c, AtaLoss_Service_Listing_URL__c,
		Age_of_person_needing_support__c, Circumstances_of_death__c, Type_of_Support__c, Who_has_died__c,
		Archive_Record__c,  ( SELECT Location_Tag1__c FROM Tags__r )
	FROM Service_Listing__c
	WHERE Service_Listing_System_ID__c != null AND
				Archive_Record__c = false 
`;

async function fetchAllSFRecords() {

	sfRecords = [];
	
	let url = `${instanceUrl}/services/data/v63.0/query?q=${encodeURIComponent(servicesSoql.trim())}`;

	while (url) {
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${accessToken}`
			}
		});

		const data = await res.json();
		sfRecords.push(...data.records);
		url = data.nextRecordsUrl ? `${instanceUrl}${data.nextRecordsUrl}` : null;
	}
	console.log(`${sfRecords.length} records loaded from CRM`);
}

async function findExtraListings(sfRecords, combinedFiltered) {

  const activeIds = new Set(sfRecords.map(r => r.Service_Listing_System_ID__c));
  const potentiallyMissing = combinedFiltered.filter(item => !activeIds.has(item.salesforceId));

  const missing = [];
  const archived = [];

  // Batch SOQL query to check these potentially missing salesforceIds
  const systemIdsToCheck = potentiallyMissing.map(item => `'${item.salesforceId}'`).join(',');
	
	if (!systemIdsToCheck || systemIdsToCheck.trim() === "") {
		return { missing, archived };
	}
	
  const query = `
    SELECT Id, Service_Listing_System_ID__c, Archive_Record__c
    FROM Service_Listing__c
    WHERE Service_Listing_System_ID__c IN (${systemIdsToCheck})
  `;

  const response = await fetch(`${instanceUrl}/services/data/v63.0/query?q=${encodeURIComponent(query)}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to query Salesforce: ${errorText}`);
  }

  const result = await response.json();
  const archivedMap = new Map(result.records.map(r => [r.Service_Listing_System_ID__c, r.Archive_Record__c]));

  for (const item of potentiallyMissing) {
    const archivedFlag = archivedMap.get(item.salesforceId);
    if (archivedFlag === true) {
      archived.push(item);
    } else {
      missing.push(item); // Not in SF at all
    }
  }

  return { missing, archived };
}

function displayUnknownSysIds(missing, archived) {
  const container = document.getElementById('unknown-sysids');
  container.innerHTML = ''; // Clear previous content

  if ((!missing || missing.length === 0) && (!archived || archived.length === 0)) {
    container.innerHTML = '<p>All good.</p>';
    container.style.display = 'block';
    return;
  }

  let html = '<p>The second step is to make sure that all live listings, are matched by \
								unarchived records in the CRM.';

  if (missing.length) {
		missing.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
		
		html += `<p>These following listings (each clickable to edit) don't have a matching
							record (as identified by system ID) in the CRM. Either the system ID in the 
							listing needs to be corrected, the listing unpublished or a new record needs
							to be created in the CRM and its system ID replaced in the listing. After 
							updating the blog listings, don't forget to regenerate the cache and Ctrl 
							Refresh this page, as this page is based on that cache.</p><ul>`;
		html += missing.map(item => {
			const updatedUrl = item.fullUrl?.replace('www.ataloss.org', 'ataloss.squarespace.com') || '#';
			return `<li><a href="${updatedUrl}" target="_blank">${item.title}</a> (System ID: ${item.salesforceId})</li>`;
		}).join('');
    html += `</ul>`;
  }

  if (archived.length) {
		archived.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
		
    html += `<p>These following listings (each clickable to edit) are all represented
								by archived CRM records. Either the listing should be unpublished or 
								the CRM record needs to be unarchived. After updating the blog listings, 
								don't forget to regenerate the cache and Ctrl Refresh this page, as 
								this page is based on that cache.<ul>`;
		html += archived.map(item => {
			const updatedUrl = item.fullUrl?.replace('www.ataloss.org', 'ataloss.squarespace.com') || '#';
			return `<li><a href="${updatedUrl}" target="_blank">${item.title}</a> (System ID: ${item.salesforceId})</li>`;
		}).join('');
    html += `</ul>`;
  }

  container.innerHTML = html;
  container.style.display = 'block';
}


////////////////////////////////////////////////////////
// STEP THREE
// CRM records that need archiving
////////////////////////////////////////////////////////

function findRecordsToArchive(sfRecords, combinedFiltered) {
  const currentSysIds = new Set(combinedFiltered.map(item => item.salesforceId));
  pendingArchive = sfRecords.filter(record =>
    record.Service_Listing_System_ID__c &&
    !currentSysIds.has(record.Service_Listing_System_ID__c)
  );

  const container = document.getElementById('archive-records');
  if (pendingArchive.length === 0) {
    container.innerHTML = '<p>No records need to be archived.</p>';
  } else {
		pendingArchive.sort((a, b) => a.Service_Listing_Name__c.localeCompare(b.Service_Listing_Name__c, undefined, { sensitivity: 'base' }));

    const html = `
			<p>The third step is to make sure there are no unachived records in the CRM, that aren't matched by 
				 live listings on the wensite.</p>
      <p>The following represent Service Listings in the CRM, that don't have a live listing on the website. 
			   Either the listing needs to be created on the website or you can press this button, to set the Archive 
				 flag in the CRM record of each of these Service Listings. After updating the blog listings, don't 
				 forget to regenerate the cache and Ctrl Refresh this page, as this page is based on that cache.</p>
      <ul>
        ${pendingArchive.map(r =>
          `<li>${r.Service_Listing_Name__c || '(Untitled)'} (System ID: ${r.Service_Listing_System_ID__c})</li>`
        ).join('')}
      </ul>`;
    container.innerHTML = html;
  }
  container.style.display = 'block';
}

async function archiveRecords() {
	const archiveBtn = document.getElementById('archiveBtn');
	archiveBtn.disabled = true;

  const container = document.getElementById('archive-records');
	container.innerHTML = 'Archiving ...';
	
  for (const record of pendingArchive.slice(0,1)) {
    const response = await fetch(`${instanceUrl}/services/data/v63.0/sobjects/Service_Listing__c/${record.Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        Archive_Record__c: true
      })
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to archive record ${record.Id}: ${response.status} — ${err}`);
    }
  }
	
	// check again

	// refresh SF records
	await fetchAllSFRecords();
	
	findRecordsToArchive(sfRecords, window.combinedFiltered);
	if (pendingArchive.length > 0) {
		archiveBtn.disabled = false;
	}
}


////////////////////////////////////////////////////////
// STEP FOUR
// CRM records that need updating
////////////////////////////////////////////////////////

// Function to create a new tag record
async function createTagRecord(serviceListingId, tagValue) {
  const response = await fetch(`${instanceUrl}/services/data/v63.0/sobjects/Tags__c`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      Service_Listing__c: serviceListingId,
      Tag_Type__c: 'Location Tag',
      Location_Tag1__c: tagValue
    })
  });

  if (!response.ok) {
    const errorDetails = await response.json().catch(() => ({}));
    throw new Error(`Failed to create tag "${tagValue}" for ${serviceListingId}: ${response.status} ${response.statusText} — ${JSON.stringify(errorDetails)}`);
  }
}

// Function to delete an existing tag record
async function deleteTagRecord(serviceListingId, tagValue) {
  // Step 1: Query for the tag record(s)
  const query = `SELECT Id FROM Tags__c WHERE Service_Listing__c = '${serviceListingId}' AND Location_Tag1__c = '${tagValue}'`;
  const queryUrl = `${instanceUrl}/services/data/v63.0/query?q=${encodeURIComponent(query)}`;

  const queryResponse = await fetch(queryUrl, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!queryResponse.ok) {
    const errorDetails = await queryResponse.json().catch(() => ({}));
    throw new Error(`Failed to query tag for deletion: ${queryResponse.status} ${queryResponse.statusText} — ${JSON.stringify(errorDetails)}`);
  }

  const result = await queryResponse.json();

  // Step 2: Delete each tag record found
  for (const record of result.records) {
    const deleteResponse = await fetch(`${instanceUrl}/services/data/v63.0/sobjects/Tags__c/${record.Id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!deleteResponse.ok) {
      const errorDetails = await deleteResponse.json().catch(() => ({}));
      throw new Error(`Failed to delete tag record ${record.Id}: ${deleteResponse.status} ${deleteResponse.statusText} — ${JSON.stringify(errorDetails)}`);
    }
  }
}

// Compare SF records to combinedFiltered and return updates needed
function getMismatchedArticles(sfRecords, combinedFiltered) {
  const updates = [];

  for (const item of combinedFiltered) {
    const sfRecord = sfRecords.find(
      rec => rec.Service_Listing_System_ID__c === item.salesforceId
    );

    if (!sfRecord) continue; // No matching SF record found

    const fieldsToUpdate = {};
    const originalValues = {};
    let needsUpdate = false;

    // Compare simple text fields
    if (sfRecord.Service_Listing_Name__c !== item.title) {
      fieldsToUpdate.Service_Listing_Name__c = item.title;
      originalValues.Service_Listing_Name__c = sfRecord.Service_Listing_Name__c;
      needsUpdate = true;
    }

    if (sfRecord.AtaLoss_Service_Listing_URL__c !== item.fullUrl) {
      fieldsToUpdate.AtaLoss_Service_Listing_URL__c = item.fullUrl;
			originalValues.AtaLoss_Service_Listing_URL__c = sfRecord.AtaLoss_Service_Listing_URL__c;
      needsUpdate = true;
    }

    // Compare picklist fields (unordered arrays)
    const compareArrayField = (sfVal, itemVal) => {
      const sfArray = (sfVal || '').split(';').map(s => s.trim()).filter(Boolean);
      const itemArray = (itemVal || []).slice().sort();
      return sfArray.slice().sort().join('|') !== itemArray.join('|');
    };

    if (compareArrayField(sfRecord.Age_of_person_needing_support__c, item.catAgePerson)) {
      fieldsToUpdate.Age_of_person_needing_support__c = item.catAgePerson.sort().join(';');
			originalValues.Age_of_person_needing_support__c = sfRecord.Age_of_person_needing_support__c?.split(';')?.sort()?.join(';');
      needsUpdate = true;
    }

    if (compareArrayField(sfRecord.Circumstances_of_death__c, item.catCDeath)) {
      fieldsToUpdate.Circumstances_of_death__c = item.catCDeath.sort().join(';');
			originalValues.Circumstances_of_death__c = sfRecord.Circumstances_of_death__c?.split(';')?.sort()?.join(';');
      needsUpdate = true;
    }

    if (compareArrayField(sfRecord.Type_of_Support__c, item.catType)) {
      fieldsToUpdate.Type_of_Support__c = item.catType.sort().join(';');
			originalValues.Type_of_Support__c = sfRecord.Type_of_Support__c?.split(';')?.sort()?.join(';');
      needsUpdate = true;
    }

    if (compareArrayField(sfRecord.Who_has_died__c, item.catWho)) {
      fieldsToUpdate.Who_has_died__c = item.catWho.sort().join(';');
			originalValues.Who_has_died__c = sfRecord.Who_has_died__c?.split(';')?.sort()?.join(';');
      needsUpdate = true;
    }

    // Compare location tags
    const sfTags = (sfRecord.Tags__r && sfRecord.Tags__r.records.map(tag => tag.Location_Tag1__c)) || [];
    const itemTags = item.catLocation || [];
    const currentSorted = sfTags.slice().sort();
    const desiredSorted = itemTags.slice().sort();

    const tagsChanged = currentSorted.join('|') !== desiredSorted.join('|');

    if (needsUpdate || tagsChanged) {
      updates.push({
        id: sfRecord.Id,
				title: sfRecord.Service_Listing_Name__c,
        fieldsToUpdate,
				originalValues,
        locationTagsUpdate: tagsChanged
          ? {
              current: sfTags,
              desired: itemTags
            }
          : null
      });
    }
  }

  return updates;
}

// Function to update a service listing record
async function updateServiceListingRecord(serviceListingId, fields) {
  const response = await fetch(`${instanceUrl}/services/data/v63.0/sobjects/Service_Listing__c/${serviceListingId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(fields)
  });

  if (!response.ok) {
    const errorDetails = await response.json().catch(() => ({}));
    throw new Error(`Failed to update Service_Listing__c ${serviceListingId}: ${response.status} ${response.statusText} — ${JSON.stringify(errorDetails)}`);
  }
}

const fieldLabels = {
  Service_Listing_Name__c: { label: "Service Title", picklist: false },
  AtaLoss_Service_Listing_URL__c: { label: "Service URL", picklist: false },
  Age_of_person_needing_support__c: { label: "Age of Person Needing Support", picklist: true },
  Circumstances_of_death__c: { label: "Circumstances of Death", picklist: true },
  Type_of_Support__c: { label: "Type of Support", picklist: true },
  Who_has_died__c: { label: "Who Has Died", picklist: true }
};

async function reviewChanges() {
  try {
		
		const reviewBtn = document.getElementById('reviewBtn');
		const syncBtn = document.getElementById('syncBtn');
		reviewBtn.disabled = true;
		syncBtn.disabled = true;
		
		container = document.getElementById("update-records");
		container.innerHTML = 'Updating ...';

		// refresh SF records
		await fetchAllSFRecords();

    // Get mismatches
    pendingUpdates = await getMismatchedArticles(sfRecords, window.combinedFiltered);
		console.log(`${pendingUpdates.length} mismatched articles found`);

    // Render report
    if (pendingUpdates.length === 0) {
      container.innerHTML = "<p>No updates required.</p>";
    } else {
			const theseUpdates = pendingUpdates.slice(0,NUMBER_OF_CHANGES);
			container.innerHTML =
				`
				 <p>The fourth and final step, now that we've made sure there is a one-to-one mapping of live 
						articles with unarchived CRM Service Listing records, is to reflect the latest values on 
						the listings, to the CRM records. Changes will be displayed below ${NUMBER_OF_CHANGES} 
						records at a time and then you can sync them to the CRM, by pressing the Sync Batch to CRM
						button. Then you can request the next batch of changes, by clicking the Review Changes 
						button.</p>
						<p>This batch of ${theseUpdates.length} CRM records that need updating out of total of ${pendingUpdates.length}:</p>
				 <ol>${theseUpdates.map(u => {
					const fieldChanges = Object.entries(u.fieldsToUpdate || {}).map(([field, newValue]) => {
						const { label, picklist } = fieldLabels[field] || { label: field, picklist: false };
						const oldValueRaw = u.originalValues?.[field] ?? "";
						const newValueRaw = newValue ?? "";

						if (picklist) {
							const oldList = oldValueRaw.split(';').map(s => s.trim()).filter(Boolean);
							const newList = newValueRaw.split(';').map(s => s.trim()).filter(Boolean);

							const added = newList.filter(v => !oldList.includes(v));
							const removed = oldList.filter(v => !newList.includes(v));

							const changeList = [
								...(added.length ? [`<li>Add: ${added.join(', ')}</li>`] : []),
								...(removed.length ? [`<li>Remove: ${removed.join(', ')}</li>`] : [])
							].join("");

							return `<li style="margin-left:1em"><strong>${label}</strong>:
												<ul>${changeList || "<li>(no changes)</li>"}</ul></li>`;
						} else {
							return `<li style="margin-left:1em"><strong>${label}</strong>: 
												<ul><li>"${oldValueRaw}" →</li><li>"${newValueRaw}"</li></ul></li>`;
						}
					}).join("");
				
					const addedTags = u.locationTagsUpdate?.desired?.filter(
						tag => !u.locationTagsUpdate.current.includes(tag)
					) || [];

					const removedTags = u.locationTagsUpdate?.current?.filter(
						tag => !u.locationTagsUpdate.desired.includes(tag)
					) || [];
					
					const tagChanges = 
						(addedTags.length || removedTags.length)
							? `<li style="margin-left:1em"><strong>Locations</strong>:
									<ul>
										${addedTags.length ? `<li>Add: ${addedTags.join(", ")}</li>` : ""}
										${removedTags.length ? `<li>Remove: ${removedTags.join(", ")}</li>` : ""}
									</ul>
								</li>`
							: "";

					return `
						<li>
							<strong>${u.title}</strong> (${u.id})
							<ul>
								${fieldChanges}
								${tagChanges}
							</ul>
						</li>
					`;
				}).join("")}</ol>`;

			const syncBtn = document.getElementById('syncBtn');
			syncBtn.disabled = false;
    }

    container.style.display = "block";
  } catch (err) {
    console.error("Failed to get mismatched articles:", err);
    alert("Error while reviewing changes. See console for details.");
  }

	reviewBtn.disabled = false;
	syncBtn.disabled = false;
}

// sync changes to CRM
async function syncTitles() {

	const reviewBtn = document.getElementById('reviewBtn');
	const syncBtn = document.getElementById('syncBtn');
	reviewBtn.disabled = true;
	syncBtn.disabled = true;
	
	container = document.getElementById("update-records");
	container.innerHTML = 'Syncing ...';
	
	if (pendingUpdates.length) {
		const theseUpdates = pendingUpdates.slice(0,NUMBER_OF_CHANGES).slice(0,1);
		console.log(theseUpdates);
		await updateRecordsInBatches(theseUpdates,createTagRecord,deleteTagRecord,updateServiceListingRecord);
		console.log(`Update complete for ${theseUpdates.length}`);
	} else {
		console.log("No updates needed");
	}

	reviewBtn.disabled = false;
	syncBtn.disabled = false;
	
	container.innerHTML = '<p>Those changes are now done. Press the Review Changes button, to get the next batch.<p>';
}

// Sample update function that processes tag changes first
async function updateRecordsInBatches(updates, createTagRecord, deleteTagRecord, updateServiceListingRecord) {
  for (const update of updates) {
    const { id, locationTagsUpdate } = update;

    if (locationTagsUpdate) {
      const { current, desired } = locationTagsUpdate;

      const toAdd = desired.filter(tag => !current.includes(tag));
      const toRemove = current.filter(tag => !desired.includes(tag));

      for (const tag of toAdd) {
        await createTagRecord(id, tag);
      }

      for (const tag of toRemove) {
        await deleteTagRecord(id, tag);
      }
    }
  }

  // Batch regular field updates
  const fieldUpdates = updates.filter(u => Object.keys(u.fieldsToUpdate).length);

  for (const update of fieldUpdates) {
    await updateServiceListingRecord(update.id, update.fieldsToUpdate);
  }
}


////////////////////////////////////////////////////////
// MAIN ROUTINE
// page loaded, check access token, 
// start processing the steps as far as is possible
////////////////////////////////////////////////////////

// Initialize everything after DOM is ready
window.addEventListener('load', async () => {

	// hide steps 2-4 initially
	const stepTwoSection = document.getElementById("steptwo");
  stepTwoSection.style.display = "none";
	const stepThreeSection = document.getElementById("stepthree");
  stepThreeSection.style.display = "none";
	const stepFourSection = document.getElementById("stepfour");
  stepFourSection.style.display = "none";

	const loginBtn = document.getElementById('loginBtn');
	const reviewBtn = document.getElementById('reviewBtn');
	const syncBtn = document.getElementById('syncBtn');
	const archiveBtn = document.getElementById('archiveBtn');

	const isAtalossDomain = window.location.hostname === "www.ataloss.org";
	const unknownSysIdsDiv = document.getElementById("unknown-sysids");

	// Extract token from hash and validate it
	if (window.location.hash.includes('access_token')) {
		const tokenInfo = getTokenFromHash();
		accessToken = tokenInfo.accessToken;
		instanceUrl = tokenInfo.instanceUrl;

		// Test the token by making a lightweight Salesforce API call
		fetch(`${instanceUrl}/services/data/v63.0/`, {
			headers: {
				'Authorization': `Bearer ${accessToken}`
			}
		})
		.then(response => {
			if (response.ok) {
				console.log("Authenticated with Salesforce");
				reviewBtn.disabled = false;   // Enable Review
				loginBtn.disabled = true;     // Disable Login
			} else {
				throw new Error("Access token invalid");
			}
		})
		.catch(error => {
			console.error("Salesforce auth failed:", error);
			accessToken = null;
			instanceUrl = null;
			reviewBtn.disabled = true;

			// Clean up URL to remove token
			window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
		});
	} else if (!isAtalossDomain) {
		console.log("here");
		if (loginBtn) loginBtn.disabled = true;
    unknownSysIdsDiv.innerHTML = '<p style="color: red;"><strong>You can only connect to the CRM if viewing this page under the www.ataloss.org domain.</strong></p>';
    unknownSysIdsDiv.style.display = 'block';
	} 

	// Button event listeners
	loginBtn.addEventListener('click', loginWithSalesforce);
	reviewBtn.addEventListener('click', reviewChanges);
	syncBtn.addEventListener('click', syncTitles);
	archiveBtn.addEventListener('click', archiveRecords);

	let stepOneDone = false;
	let stepTwoDone = false;
	let stepThreeDone = false;
	let stepFourDone = false;

	//step one
	stepOneDone = !missingSysids();
	//stepOneDone = true; // TESTING
	
	//step two
	if (stepOneDone) {
		// no listings missing their sytem ID, so display step two and, if connected to CRM, process step 2
		stepTwoSection.style.display = "flex";

		if(accessToken) {
			await fetchAllSFRecords();
			const { missing, archived } = await findExtraListings(sfRecords, window.combinedFiltered);
			displayUnknownSysIds(missing, archived);
			stepTwoDone = (missing.length == 0 && archived.length == 0)
		}
	}
	//stepTwoDone = true; // TESTING
	
	// step three
	if(stepTwoDone) {
		// display section
		stepThreeSection.style.display = "flex";
		
		// find records that should be srchived and enable button to archive
		findRecordsToArchive(sfRecords, window.combinedFiltered);
		if (pendingArchive.length > 0) {
			archiveBtn.disabled = false;
		} else {
			stepThreeDone = true;
		}
	}
	//stepThreeDone = true; // TESTING
	
	// step four
	if (stepThreeDone) {
		// display section
		stepFourSection.style.display = "flex";
		
		reviewChanges();
	}

});



