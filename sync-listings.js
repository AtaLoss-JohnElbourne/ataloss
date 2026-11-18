const LOGIN_URL = 'https://login.salesforce.com';
const TOKEN_URL = 'https://ataloss.my.salesforce.com'; // My Domain required for browser CORS token exchange
const NUMBER_OF_CHANGES = 10; // Number of changes to display
const NUMBER_TO_UPDATE = 1; // Number of records to actually update (set to 10 when ready for production)
const GITHUB_USERNAME = 'AtaLoss-JohnElbourne';
const GITHUB_REPO = 'ataloss';
const GITHUB_BRANCH = 'main';
const GITHUB_FILE_PATH = window.servicesDataFileName || 'services-data.js';
const crmSlUrl = (id) =>
		`https://ataloss.lightning.force.com/lightning/r/Service_Listing__c/${id}/view`;

const pageContext = {
  isTestMode: false,
  isEditMode: false,
  isAtalossDomain: false
};

const state = {
  accessToken: null,
  instanceUrl: null,
  pendingUpdates: [],
  sfRecords: null,
  pendingArchive: [],
  pendingDateUpdates: [],
  hasGatheredData: false,
  dataSource: 'github-cache',
  gatheredContent: null,
  gatheredAt: null,
  stepOneDone: false,
  stepTwoDone: false,
  stepThreeDone: false,
  stepFourDone: false,
  stepFiveDone: false
};

const runtimeConfig = {
  githubCommitMessage: '',
  refreshDataGuidance: '',
  stepFiveIgnoreBeforeDate: ''
};

function applySquarespaceRuntimeConfig() {
  const sqspConfig = window.syncListingsConfig || {};
  const stepFive = document.getElementById('stepfive');

  runtimeConfig.githubCommitMessage =
    sqspConfig.githubCommitMessage ||
    stepFive?.dataset?.githubCommitMessage ||
    '';

  runtimeConfig.refreshDataGuidance =
    sqspConfig.refreshDataGuidance ||
    stepFive?.dataset?.refreshDataGuidance ||
    '';

  runtimeConfig.stepFiveIgnoreBeforeDate =
    sqspConfig.stepFiveIgnoreBeforeDate ||
    stepFive?.dataset?.stepFiveIgnoreBeforeDate ||
    '';
}

// Delete 'featured' array to free memory
if (window.sectionData && window.sectionData['featured']) {
  delete window.sectionData['featured'];
}

function extractedData(delimiter, dataArrays = []) {
  const combinedData = [];
  dataArrays.forEach((data) => {
    if (data.includes(delimiter) && data.split(delimiter)[1].trim() !== '') {
      combinedData.push(data.split(delimiter)[1].trim());
    }
  });
  return [...new Set(combinedData)];
}

function extractSalesforceIdAndCleanBody(body = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(body, 'text/html');
  let salesforceId = null;

  doc.querySelectorAll('p').forEach((p) => {
    const match = p.textContent.trim().match(/^\[(\w{15})\]$/);
    if (match) {
      salesforceId = match[1];
      p.remove();
    }
  });

  return {
    salesforceId,
    cleanedBody: doc.body.innerHTML.trim()
  };
}

function buildServicesDataModel(servicesData, logFn = () => {}) {
  let wholeCategories = {};
  let catWho = [], whoCat = [], catCDeath = [], cDeathCat = [], catAgePerson = [], agePersonCat = [], catLocation = [], locationCat = [], catType = [], typeCat = [];
  let featuredData = [], nationalData = [], regionalData = [];

  servicesData.forEach((item) => {
    catWho = extractedData('Who:', item.categories || []);
    catCDeath = extractedData('Cir:', item.categories || []);
    catAgePerson = extractedData('Age:', item.categories || []);
    catLocation = extractedData('Location:', item.categories || []);
    catType = extractedData('Type:', item.categories || []);
    const { salesforceId, cleanedBody } = extractSalesforceIdAndCleanBody(item.body);
    const requiredData = [{
      id: item.id,
      fullUrl: item.fullUrl,
      title: item.title,
      excerpt: item.excerpt,
      featured: item.starred,
      publishOn: item.publishOn,
      updatedOn: item.updatedOn,
      catWho: catWho,
      catCDeath: catCDeath,
      catAgePerson: catAgePerson,
      catLocation: catLocation,
      catType: catType,
      salesforceId,
      body: cleanedBody
    }];

    whoCat = [...new Set([...whoCat, ...catWho])];
    cDeathCat = [...new Set([...cDeathCat, ...catCDeath])];
    agePersonCat = [...new Set([...agePersonCat, ...catAgePerson])];
    locationCat = [...new Set([...locationCat, ...catLocation])];
    typeCat = [...new Set([...typeCat, ...catType])];

    if (item.starred) featuredData.push(...requiredData);
    if (catLocation.includes('NATIONAL ORGANISATIONS')) {
      nationalData.push(...requiredData);
    } else {
      regionalData.push(...requiredData);
    }
  });

  wholeCategories = {
    catWho: whoCat.sort(),
    catCDeath: cDeathCat.sort(),
    catAgePerson: agePersonCat.sort(),
    catLocation: locationCat.sort(),
    catType: typeCat.sort(),
  };

  featuredData.sort((a, b) => a.title.localeCompare(b.title));
  nationalData.sort((a, b) => a.title.localeCompare(b.title));
  regionalData.sort((a, b) => a.title.localeCompare(b.title));

  logFn('Featured Services: ' + featuredData.length);
  logFn('Regional Services: ' + regionalData.length);
  logFn('National Services: ' + nationalData.length);
  logFn('Total Services: ' + (regionalData.length + nationalData.length));

  if (featuredData.length < 10 || regionalData.length < 1300 || nationalData.length < 150) {
    throw new Error('Error retrieving services - the counts are too low');
  }

  const sectionData = [];
  sectionData['featured'] = featuredData;
  sectionData['national'] = nationalData;
  sectionData['regional'] = regionalData;

  return {
    wholeCategories,
    sectionData
  };
}

function serialiseServicesDataModel(model) {
  let content = '// Auto generated file with services data for the sevices search tool at\n';
  content += '// https://ataloss.squarespace.com/bereavement-services\n\n';
  content += `window.wholeCategories = ${JSON.stringify(model.wholeCategories, null, 2)};\n\n`;
  content += 'window.sectionData = [];\n\n';
  content += `window.sectionData['featured'] = ${JSON.stringify(model.sectionData['featured'], null, 2)};\n\n`;
  content += `window.sectionData['national'] = ${JSON.stringify(model.sectionData['national'], null, 2)};\n\n`;
  content += `window.sectionData['regional'] = ${JSON.stringify(model.sectionData['regional'], null, 2)};\n\n`;
  return content;
}

function applyServicesDataModel(model) {
  window.wholeCategories = model.wholeCategories;
  window.sectionData = [];
  window.sectionData['featured'] = model.sectionData['featured'];
  window.sectionData['national'] = model.sectionData['national'];
  window.sectionData['regional'] = model.sectionData['regional'];
  state.gatheredContent = serialiseServicesDataModel(model);
  state.gatheredAt = new Date().toISOString();
  state.hasGatheredData = true;
  state.dataSource = 'gathered-live';
}

function getDataActionElements() {
  return {
    gatherBtn: document.getElementById('gatherDataBtn'),
    commitBtn: document.getElementById('commitGithubBtn'),
    patInput: document.getElementById('githubPatInput'),
    status: document.getElementById('dataActionStatus'),
    log: document.getElementById('dataActionLog')
  };
}

function appendActionLog(message) {
  const { log } = getDataActionElements();
  if (!log) {
    console.log('[sync-data]', message);
    return;
  }
  log.style.display = 'block';
  const p = document.createElement('p');
  p.style.margin = '0 0 8px';
  p.textContent = message;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

function clearActionLog() {
  const { log } = getDataActionElements();
  if (!log) return;
  log.innerHTML = '';
  log.style.display = 'none';
}

function setActionStatus(message, tone = 'info') {
  const { status } = getDataActionElements();
  if (!status) return;
  status.textContent = message;
  status.style.color = tone === 'error'
    ? '#b42318'
    : tone === 'success'
      ? '#027a48'
      : '#344054';
}

function updateCommitButtonState() {
  const { commitBtn } = getDataActionElements();
  const canCommit = Boolean(
    state.hasGatheredData &&
    state.gatheredContent &&
    state.accessToken &&
    state.stepOneDone &&
    state.stepTwoDone &&
    state.stepThreeDone &&
    state.stepFourDone &&
    state.stepFiveDone
  );
  if (commitBtn) {
    commitBtn.disabled = !canCommit;
  }

  if (!state.hasGatheredData) {
    setActionStatus('Using the GitHub cache currently loaded with the page. Press Gather current data to refresh from Squarespace before syncing.');
    return;
  }

  if (canCommit) {
    setActionStatus('No remaining sync changes were found for the gathered data. You can now commit that gathered data to GitHub.', 'success');
    return;
  }

  setActionStatus('Using gathered in-memory website data. If you edit any blog entries, press Gather current data again before continuing.');
}

function ensureDataActionsUi() {
  const requiredIds = [
    'gatherDataBtn',
    'commitGithubBtn',
    'githubPatInput',
    'dataActionStatus',
    'dataActionLog'
  ];
  const missingIds = requiredIds.filter((id) => !document.getElementById(id));
  if (missingIds.length > 0) {
    console.warn(
      '[sync-listings] Data action UI is expected from Squarespace markup. Missing IDs:',
      missingIds.join(', ')
    );
  }
}

async function fetchLatestServicesData(logFn = () => {}) {
  logFn('Fetching Service Listings Blog Entries - paginated');
  const format = 'format=json-pretty';
  const jsonPath = window.location.origin + '/more-info/bereavement-services?offset=';
  const accumulatedData = [];
  let page = 0;
  let baseUrl = '';
  let offset = 9999999999999;
  const seenIds = new Set();

  while (true) {
    page += 1;
    const url = jsonPath + offset + '&' + format;
    logFn(`Fetching page ${page}, services so far: ${accumulatedData.length}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    const data = await response.json();
    if (page === 1) {
      baseUrl = data.website.baseUrl;
    }
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (!seenIds.has(item.id)) {
          seenIds.add(item.id);
          item.fullUrl = baseUrl + item.fullUrl;
          accumulatedData.push(item);
        }
      }
    }
    if (data.pagination && data.pagination.nextPageOffset) {
      offset = data.pagination.nextPageOffset + 1;
    } else {
      break;
    }
  }

  logFn('Finished loading service listings: ' + accumulatedData.length);
  return accumulatedData;
}

async function getGitHubSha(githubToken) {
  const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}?ref=${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!res.ok) {
    throw new Error('Wrong GitHub token');
  }
  const data = await res.json();
  return data.sha;
}

async function updateGitHub(githubToken, base64Content, commitMessage) {
  appendActionLog('Uploading file to GitHub ...');
  const url = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`;
  const headers = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };

  let currentSha = await getGitHubSha(githubToken);

  for (let attempt = 1; attempt <= 2; attempt++) {
    const body = {
      message: commitMessage,
      content: base64Content,
      sha: currentSha,
      branch: GITHUB_BRANCH
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (res.ok) {
      appendActionLog('✅ File updated to GitHub: ' + data.content.path);
      const newSha = data.commit.sha;

      const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/commits/${newSha}`, {
        headers: {
          'Authorization': `Bearer ${githubToken}`,
          'Accept': 'application/vnd.github+json'
        }
      });

      const commitData = await commitRes.json();
      const fileStats = commitData.files.find(f => f.filename === GITHUB_FILE_PATH);
      if (fileStats) {
        appendActionLog(`✅ File updated: +${fileStats.additions}, -${fileStats.deletions}, Δ${fileStats.changes}`);
      } else {
        appendActionLog('✅ No changes');
      }
      return newSha;
    }

    const message = data?.message || 'Unknown GitHub API error';
    if (res.status === 409 && attempt < 2) {
      appendActionLog('ℹ️ SHA changed on GitHub, retrying upload with latest version...');
      currentSha = await getGitHubSha(githubToken);
      continue;
    }

    throw new Error(message);
  }

  throw new Error('Upload failed after retry.');
}

async function waitForPagesWorkflowPublish(githubToken, maxAttempts = 30, intervalMs = 10000) {
  const runsUrl = `https://api.github.com/repos/${GITHUB_USERNAME}/${GITHUB_REPO}/actions/runs?branch=${GITHUB_BRANCH}&per_page=10`;
  const authHeaders = {
    'Authorization': `Bearer ${githubToken}`,
    'Accept': 'application/vnd.github+json'
  };
  const publicHeaders = {
    'Accept': 'application/vnd.github+json'
  };

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, intervalMs));
    let res = await fetch(runsUrl, { headers: authHeaders });
    if (!res.ok) {
      res = await fetch(runsUrl, { headers: publicHeaders });
    }

    if (!res.ok) {
      appendActionLog(`⚠️ Could not check Actions workflow status (${res.status}) — skipping wait.`);
      return;
    }

    const data = await res.json();
    const run = (data.workflow_runs || []).find(r => {
      const name = (r.name || '').toLowerCase();
      const path = (r.path || '').toLowerCase();
      return name.includes('pages build and deployment') || path.includes('pages');
    });

    if (!run) {
      appendActionLog(`Waiting for Pages workflow run to appear (attempt ${i + 1}/${maxAttempts})`);
      continue;
    }

    if (run.status === 'completed' && run.conclusion === 'success') {
      appendActionLog('✅ GitHub Pages published (via Actions workflow).');
      return;
    }

    if (run.status === 'completed' && run.conclusion && run.conclusion !== 'success') {
      throw new Error('GitHub Pages workflow failed: ' + run.conclusion);
    }

    appendActionLog('Pages workflow in progress...');
  }

  appendActionLog('⚠️ Timed out waiting for GitHub Pages workflow completion.');
}

async function gatherCurrentData() {
  const { gatherBtn, commitBtn } = getDataActionElements();
  if (gatherBtn) gatherBtn.disabled = true;
  if (commitBtn) commitBtn.disabled = true;
  clearActionLog();
  appendActionLog('Gathering current website data from Squarespace ...');
  setActionStatus('Gathering current website data from Squarespace ...');

  state.stepOneDone = false;
  state.stepTwoDone = false;
  state.stepThreeDone = false;
  state.stepFourDone = false;
  state.stepFiveDone = false;

  try {
    const servicesData = await fetchLatestServicesData(appendActionLog);
    const model = buildServicesDataModel(servicesData, appendActionLog);
    applyServicesDataModel(model);
    appendActionLog('Generated in-memory services data ready for sync checks.');
    await runWorkflow();
    setActionStatus('Using gathered in-memory website data. If you edit any blog entries, press Gather current data again before continuing.', 'success');
  } catch (error) {
    console.error('Failed to gather current data:', error);
    appendActionLog('🚨 Error: ' + error.message);
    setActionStatus('Failed to gather current data. See the log below.', 'error');
  } finally {
    if (gatherBtn) gatherBtn.disabled = false;
    updateCommitButtonState();
  }
}

async function commitGatheredDataToGitHub() {
  const { commitBtn, patInput } = getDataActionElements();
  const githubToken = patInput ? patInput.value.trim() : '';
  if (!githubToken) {
    setActionStatus('Enter a GitHub PAT before committing the gathered data.', 'error');
    return;
  }
  if (!state.gatheredContent) {
    setActionStatus('Gather current data first.', 'error');
    return;
  }

  commitBtn.disabled = true;
  clearActionLog();
  appendActionLog('Preparing gathered data for GitHub commit ...');

  try {
    const base64Content = btoa(unescape(encodeURIComponent(state.gatheredContent)));
    const commitSha = await updateGitHub(githubToken, base64Content, runtimeConfig.githubCommitMessage);
    if (commitSha) {
      await waitForPagesWorkflowPublish(githubToken);
      setActionStatus('Gathered data committed to GitHub successfully.', 'success');
    }
  } catch (error) {
    console.error('Failed to commit gathered data:', error);
    appendActionLog('🚨 Error: ' + error.message);
    setActionStatus('Failed to commit gathered data to GitHub. See the log below.', 'error');
  } finally {
    updateCommitButtonState();
  }
}

function clearWorkflowContainers() {
  ['missing-sysids', 'unknown-sysids', 'archive-records', 'update-records', 'date-updates'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) {
      element.innerHTML = '';
      element.style.display = 'block';
    }
  });
}

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
  intro.innerHTML = `The first step is to make sure that all listings have an identifiable \
										 SalesForce system ID (15 alphanumeric characters), enclosed in square \
										 brackets and on a line of their own at the end of the listing body. \
										 These following listings (each clickable to edit) do not have their \
										 system ID and that needs to be added to all of these, before you can \
                   proceeed to the next step of the process. ${runtimeConfig.refreshDataGuidance}`;
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

function displayDuplicateItems(duplicatesMap, container) {
  const intro = document.createElement('p');
  intro.innerHTML = `
    The following listings have duplicate Salesforce system IDs. Either one of 
		the listings needs to have a new System ID or it needs unpublishing. Don't 
		forget to press "Gather current data" again on this page after editing the 
		blog listings. 
  `;
  container.appendChild(intro);

  const list = document.createElement('ul');

  // Iterate over each duplicate system ID and its associated items
  Object.entries(duplicatesMap).forEach(([systemId, items]) => {
    const li = document.createElement('li');
    li.innerHTML = `<strong>System ID: ${systemId}</strong>`;
    const sublist = document.createElement('ul');

    // Add each item associated with the duplicate system ID
    items.forEach(item => {
      const subItem = document.createElement('li');
      const link = document.createElement('a');
      link.href = item.fullUrl.replace('www.ataloss.org', 'ataloss.squarespace.com');
      link.textContent = item.title;
      link.target = '_blank'; // Open in new tab
      subItem.appendChild(link);
      sublist.appendChild(subItem);
    });

    li.appendChild(sublist);
    list.appendChild(li);
  });

  container.appendChild(list);
}

// Helper function to find duplicates across arrays
function findDuplicates(arr) {
  const idCounts = {};
  const duplicateIds = new Set();
  const duplicatesMap = {};

  // First pass: Count occurrences of each salesforceId
  arr.forEach(item => {
    if (!item.salesforceId) return; // Skip items without a Salesforce ID
    idCounts[item.salesforceId] = (idCounts[item.salesforceId] || 0) + 1;

    // If the count is 2 or more, mark the ID as duplicated
    if (idCounts[item.salesforceId] === 2) {
      duplicateIds.add(item.salesforceId);
    }
  });

  // Second pass: Collect all items with duplicated IDs
  arr.forEach(item => {
    if (duplicateIds.has(item.salesforceId)) {
      if (!duplicatesMap[item.salesforceId]) {
        duplicatesMap[item.salesforceId] = [];
      }
      duplicatesMap[item.salesforceId].push(item);
    }
  });

  return duplicatesMap;
}

// find listing that don't have a salesforce system ID
function missingSysids() {
  // Track removed entries (no Salesforce ID)
  const removedItems = [];
  const duplicateItemsMap = {};
	const container = document.getElementById('missing-sysids');
	container.innerHTML = '';
	const nationalData = window.sectionData?.['national'] || [];
	const regionalData = window.sectionData?.['regional'] || [];

  // Process arrays
  const nationalFiltered = filterAndTransform(nationalData, removedItems);
  const regionalFiltered = filterAndTransform(regionalData, removedItems);

  // Combine national and regional arrays to find duplicates across both
  const combinedArray = [...nationalData, ...regionalData];
  const duplicatesMap = findDuplicates(combinedArray);

  // Display any listings without a system ID
  container.style.display = 'block'; // Make sure it's visible

  if (removedItems.length > 0) {
    displayRemovedItems(removedItems, container);
  } else {
		const allGood = document.createElement('p');
		allGood.innerHTML = `
			There aren't any listings missing a CRM System ID.
		`;
		container.appendChild(allGood);
  }

  // Display duplicates
  if (Object.keys(duplicatesMap).length > 0) {
    displayDuplicateItems(duplicatesMap, container);
  } else {
		const allGood = document.createElement('p');
		allGood.innerHTML = `
			There are no listings with duplicated CRM System IDs
		`;
		container.appendChild(allGood);
  }

  // Combine valid entries into one array
  window.combinedFiltered = [...nationalFiltered, ...regionalFiltered];
  console.log(`${window.combinedFiltered.length} non-TBJ blog listings found`);

  return removedItems.length > 0 || Object.keys(duplicatesMap).length > 0;
}

////////////////////////////////////////////////////////
// CONNECT TO CRM
// oauth redirect, login and direct back
////////////////////////////////////////////////////////

const OAUTH_CODE_VERIFIER_KEY = 'sf_oauth_code_verifier';
const OAUTH_STATE_KEY = 'sf_oauth_state';
const STEP_FIVE_IGNORE_BEFORE_DATE_KEY = 'sf_step5_ignore_before_date';
// localStorage is used (not sessionStorage) because Squarespace redirects can clear sessionStorage
const oauthStorage = window.localStorage;

function base64UrlEncode(uint8Array) {
  return btoa(String.fromCharCode(...uint8Array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function generateRandomString(length = 64) {
  // Note: ~ excluded intentionally - URLSearchParams encodes ~ as %7E which breaks PKCE verification on Salesforce
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._';
  const randomValues = new Uint8Array(length);
  window.crypto.getRandomValues(randomValues);
  let result = '';
  for (let i = 0; i < randomValues.length; i += 1) {
    result += charset[randomValues[i] % charset.length];
  }
  return result;
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await window.crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function getOAuthError() {
  const queryParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const error = queryParams.get('error') || hashParams.get('error');
  const errorDescription = queryParams.get('error_description') || hashParams.get('error_description');
  if (!error) {
    return null;
  }
  return {
    error,
    errorDescription: errorDescription ? decodeURIComponent(errorDescription) : ''
  };
}

async function handleOAuthCodeCallback() {
  const queryParams = new URLSearchParams(window.location.search);
  const authCode = queryParams.get('code');
  if (!authCode) {
    return false;
  }

  const expectedState = oauthStorage.getItem(OAUTH_STATE_KEY);
  const callbackState = queryParams.get('state');
  if (expectedState && callbackState !== expectedState) {
    throw new Error('OAuth state validation failed');
  }

  const codeVerifier = oauthStorage.getItem(OAUTH_CODE_VERIFIER_KEY);
  if (!codeVerifier) {
    throw new Error('OAuth code verifier not found in storage');
  }

  const tokenUrl = `${TOKEN_URL}/services/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: window.oauthConfig.clientId,
    redirect_uri: window.oauthConfig.redirectUri,
    code: authCode,
    code_verifier: codeVerifier
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const tokenData = await response.json();
  if (!response.ok) {
    const description = tokenData.error_description || tokenData.error || 'Unknown token exchange error';
    throw new Error(`OAuth token exchange failed: ${description}`);
  }

  state.accessToken = tokenData.access_token;
  state.instanceUrl = tokenData.instance_url;

  oauthStorage.removeItem(OAUTH_CODE_VERIFIER_KEY);
  oauthStorage.removeItem(OAUTH_STATE_KEY);
  queryParams.delete('code');
  queryParams.delete('state');
  const query = queryParams.toString();
  const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  window.history.replaceState({}, document.title, cleanUrl);

  return true;
}

// Parse access token from the URL after login redirect
function getTokenFromHash() {
	const hash = window.location.hash.substring(1);
	const params = new URLSearchParams(hash);
	return {
		accessToken: params.get('access_token'),
		instanceUrl: params.get('instance_url')
	};
}

function persistStepFiveCutoffFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlOverride = urlParams.get('step5IgnoreBeforeDate');
  if (urlOverride === null) {
    return;
  }

  const trimmed = urlOverride.trim();
  if (trimmed) {
    oauthStorage.setItem(STEP_FIVE_IGNORE_BEFORE_DATE_KEY, trimmed);
  } else {
    oauthStorage.removeItem(STEP_FIVE_IGNORE_BEFORE_DATE_KEY);
  }
}

// Perform login redirect
async function loginWithSalesforce() {
  persistStepFiveCutoffFromUrl();

  const codeVerifier = generateRandomString(96);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const oauthState = generateRandomString(24);
  oauthStorage.setItem(OAUTH_CODE_VERIFIER_KEY, codeVerifier);
  oauthStorage.setItem(OAUTH_STATE_KEY, oauthState);

  const authUrl = `${LOGIN_URL}/services/oauth2/authorize?response_type=code&client_id=${window.oauthConfig.clientId}&redirect_uri=${encodeURIComponent(window.oauthConfig.redirectUri)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=S256&state=${encodeURIComponent(oauthState)}`;
  window.location.href = authUrl;
}


////////////////////////////////////////////////////////
// STEP TWO
// listings with a CRM System ID not found in the CRM
////////////////////////////////////////////////////////

const servicesSoql = `
	SELECT Id, Service_Listing_System_ID__c, Service_Listing_Name__c, AtaLoss_Service_Listing_URL__c,
		Age_of_person_needing_support__c, Circumstances_of_death__c, Type_of_Support__c, Who_has_died__c,
		Archive_Record__c, Date_Last_Updated_on_Website__c, Date_of_most_recent_verification__c,
		( SELECT Location_Tag1__c FROM Tags__r )
	FROM Service_Listing__c
	WHERE Service_Listing_System_ID__c != null AND
				Archive_Record__c = false 
`;

async function fetchAllSFRecords() {

	state.sfRecords = [];
	
	let url = `${state.instanceUrl}/services/data/v63.0/query?q=${encodeURIComponent(servicesSoql.trim())}`;

	while (url) {
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${state.accessToken}`
			}
		});

		const data = await res.json();
		state.sfRecords.push(...data.records);
		url = data.nextRecordsUrl ? `${state.instanceUrl}${data.nextRecordsUrl}` : null;
	}
	console.log(`${state.sfRecords.length} records loaded from CRM`);
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

  const response = await fetch(`${state.instanceUrl}/services/data/v63.0/query?q=${encodeURIComponent(query)}`, {
    headers: {
      'Authorization': `Bearer ${state.accessToken}`
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
              to be created in the CRM and its system ID replaced in the listing. ${runtimeConfig.refreshDataGuidance}</p><ul>`;
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
                the CRM record needs to be unarchived. ${runtimeConfig.refreshDataGuidance}<ul>`;
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
  state.pendingArchive = sfRecords.filter(record =>
    record.Service_Listing_System_ID__c &&
    !currentSysIds.has(record.Service_Listing_System_ID__c)
  );

  const container = document.getElementById('archive-records');
  if (state.pendingArchive.length === 0) {
    container.innerHTML = '<p>All good.</p>';
  } else {
		state.pendingArchive.sort((a, b) => a.Service_Listing_Name__c.localeCompare(b.Service_Listing_Name__c, undefined, { sensitivity: 'base' }));

    const html = `
			<p>The third step is to make sure there are no unachived records in the CRM, that aren't matched by 
				 live listings on the wensite.</p>
      <p>The following represent Service Listings in the CRM, that don't have a live listing on the website. 
			   Either the listing needs to be created on the website or you can press this button, to set the Archive 
         flag in the CRM record of each of these Service Listings. ${runtimeConfig.refreshDataGuidance}</p>
      <ul>
        ${state.pendingArchive.map(r =>
          `<li><a href="${crmSlUrl(r.Id)}" target="_blank">${r.Service_Listing_Name__c || '(Untitled)'} (System ID: ${r.Service_Listing_System_ID__c})</a></li>`
        ).join('')}
      </ul>`;
    container.innerHTML = html;
  }
  container.style.display = 'block';
}

async function archiveRecords(state) {
	const archiveBtn = document.getElementById('archiveBtn');
	archiveBtn.disabled = true;
  state.stepThreeDone = false;
  state.stepFourDone = false;
  state.stepFiveDone = false;
  updateCommitButtonState();

  const container = document.getElementById('archive-records');
	container.innerHTML = 'Archiving ...';
	
  for (const record of state.pendingArchive.slice(0,1)) {
    const response = await fetch(`${state.instanceUrl}/services/data/v63.0/sobjects/Service_Listing__c/${record.Id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.accessToken}`
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
	
	findRecordsToArchive(state.sfRecords, window.combinedFiltered);
  state.stepThreeDone = state.pendingArchive.length === 0;
	if (state.pendingArchive.length > 0) {
		archiveBtn.disabled = false;
	}
  updateCommitButtonState();
}


////////////////////////////////////////////////////////
// STEP FOUR
// CRM records that need updating
////////////////////////////////////////////////////////

// Helper function to detect and format picklist errors
function handlePicklistError(error, context) {
  try {
    const errorData = JSON.parse(error.message.split(' — ')[1]);
    const picklistErrors = errorData.filter(e => e.errorCode === 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST');
    
    if (picklistErrors.length > 0) {
      const errorMessages = picklistErrors.map(e => {
        const field = e.fields?.[0] || 'Unknown field';
        const badValue = e.message.match(/bad value for restricted picklist field: (.+)/)?.[1] || 'unknown value';
        return `Invalid value "${badValue}" for field ${field}`;
      }).join('; ');
      
      return {
        isPicklistError: true,
        message: `${context}: ${errorMessages}`,
        details: picklistErrors
      };
    }
  } catch (parseError) {
    // Not a picklist error or couldn't parse
  }
  
  return {
    isPicklistError: false,
    message: error.message,
    details: null
  };
}

// Function to create a new tag record
async function createTagRecord(serviceListingId, tagValue) {
  const response = await fetch(`${state.instanceUrl}/services/data/v63.0/sobjects/Tags__c`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.accessToken}`
    },
    body: JSON.stringify({
      Service_Listing__c: serviceListingId,
      Tag_Type__c: 'Location Tag',
      Location_Tag1__c: tagValue
    })
  });

  if (!response.ok) {
    const errorDetails = await response.json().catch(() => []);
    const picklistError = Array.isArray(errorDetails) && errorDetails.find(e => e.errorCode === 'INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST');
    if (picklistError) {
      const badValue = picklistError.message.match(/bad value for restricted picklist field: (.+)/)?.[1] || tagValue;
      throw new Error(`PICKLIST_ERROR: Invalid location tag value "${badValue}" — add it to the CRM picklist or correct the listing.`);
    }
    throw new Error(`Failed to create tag "${tagValue}" for ${serviceListingId}: ${response.status} — ${JSON.stringify(errorDetails)}`);
  }
}

// Function to delete an existing tag record
async function deleteTagRecord(serviceListingId, tagValue) {
  // Step 1: Query for the tag record(s)
  const query = `SELECT Id FROM Tags__c WHERE Service_Listing__c = '${serviceListingId}' AND Location_Tag1__c = '${tagValue}'`;
  const queryUrl = `${state.instanceUrl}/services/data/v63.0/query?q=${encodeURIComponent(query)}`;

  const queryResponse = await fetch(queryUrl, {
    headers: {
      'Authorization': `Bearer ${state.accessToken}`
    }
  });

  if (!queryResponse.ok) {
    const errorDetails = await queryResponse.json().catch(() => ({}));
    throw new Error(`Failed to query tag for deletion: ${queryResponse.status} ${queryResponse.statusText} — ${JSON.stringify(errorDetails)}`);
  }

  const result = await queryResponse.json();

  // Step 2: Delete only one instance of the tag if duplicates exist
  if (result.records.length > 0) {
    const recordToDelete = result.records[0]; // Select the first record to delete
    const deleteResponse = await fetch(`${state.instanceUrl}/services/data/v63.0/sobjects/Tags__c/${recordToDelete.Id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${state.accessToken}`
      }
    });

    if (!deleteResponse.ok) {
      const errorDetails = await deleteResponse.json().catch(() => ({}));
      throw new Error(`Failed to delete tag record ${recordToDelete.Id}: ${deleteResponse.status} ${deleteResponse.statusText} — ${JSON.stringify(errorDetails)}`);
    }

    console.log(`Deleted tag record ${recordToDelete.Id} for tag value "${tagValue}"`);
  } else {
    console.log(`No tag records found for tag value "${tagValue}"`);
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

    // Add the `updatedOn` timestamp only if other changes are being made
    if ((needsUpdate || tagsChanged) && item.updatedOn) {
      const updatedDate = new Date(parseInt(item.updatedOn, 10)).toISOString(); // Convert timestamp to ISO format
      fieldsToUpdate.Date_Last_Updated_on_Website__c = updatedDate;
      fieldsToUpdate.Date_of_most_recent_verification__c = updatedDate;
    }

    // Add the update if any fields need to be updated, or if tags need to be updated
    if (needsUpdate || tagsChanged) {
      updates.push({
        id: sfRecord.Id,
				slId: sfRecord.Service_Listing_System_ID__c,
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
  const response = await fetch(`${state.instanceUrl}/services/data/v63.0/sobjects/Service_Listing__c/${serviceListingId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.accessToken}`
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

async function reviewChanges(state) {
  try {
    const reviewBtn = document.getElementById('reviewBtn');
		const syncBtn = document.getElementById('syncBtn');
		reviewBtn.disabled = true;
		syncBtn.disabled = true;
    state.stepFourDone = false;
    state.stepFiveDone = false;
    updateCommitButtonState();
		
const container = document.getElementById("update-records");
		container.innerHTML = 'Updating ...';

		// Refresh Salesforce records
		await fetchAllSFRecords();

    // Get mismatches
    state.pendingUpdates = await getMismatchedArticles(state.sfRecords, window.combinedFiltered);
		console.log(`${state.pendingUpdates.length} mismatched articles found`);

    // Render report
    if (state.pendingUpdates.length === 0) {
      container.innerHTML = "<p>No updates required.</p>";
      state.stepFourDone = true;
      const stepFiveSection = document.getElementById('stepfive');
      if (stepFiveSection && state.accessToken) {
        stepFiveSection.style.display = 'flex';
        await reviewDateChanges(state);
      }
    } else {
      state.stepFourDone = false;
			const theseUpdates = state.pendingUpdates.slice(0, NUMBER_OF_CHANGES);
			container.innerHTML = 				`
				 <p>The fourth and final step, now that we've made sure there is a one-to-one mapping of live 
						articles with unarchived CRM Service Listing records, is to reflect the latest values on 
						the listings, to the CRM records. Changes will be displayed below ${NUMBER_OF_CHANGES} 
						records at a time and then you can sync them to the CRM, by pressing the Sync Batch to CRM
						button. Then you can request the next batch of changes, by clicking the Review Changes 
						button.</p>
						<p>This batch of ${theseUpdates.length} CRM records that need updating out of total of ${state.pendingUpdates.length}:</p>
				 <ol>${theseUpdates.map(u => {
          // Filter out date fields from the display
          const filteredFieldsToUpdate = Object.entries(u.fieldsToUpdate || {}).filter(
            ([field]) => !['Date_Last_Updated_on_Website__c', 'Date_of_most_recent_verification__c'].includes(field)
          );

          const fieldChanges = filteredFieldsToUpdate.map(([field, newValue]) => {
						const { label, picklist } = fieldLabels[field] || { label: field, picklist: false };
						const oldValueRaw = u.originalValues?.[field] ?? "";
						const newValueRaw = newValue ?? "";

						if (picklist) {
							const oldList = oldValueRaw.split(';').map(s => s.trim()).filter(Boolean);
							const newList = newValueRaw.split(';').map(s => s.trim()).filter(Boolean);

							const added = newList.filter(v => !oldList.includes(v));
							
							// Create a frequency map for newList
							const newListFrequency = newList.reduce((freq, value) => {
							  freq[value] = (freq[value] || 0) + 1;
							  return freq;
							}, {});

							// Filter out values from oldList that are not in newList or are duplicates
							const removed = oldList.filter(value => {
							  if (newListFrequency[value]) {
							    newListFrequency[value]--; // Decrement the count for this value
							    return false; // Value exists in newList, so it's not "removed"
							  }
							  return true; // Value is not in newList or is an extra duplicate
							});

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

					// Create a frequency map for desired tags
					const desiredTagsFrequency = u.locationTagsUpdate?.desired?.reduce((freq, tag) => {
					  freq[tag] = (freq[tag] || 0) + 1;
					  return freq;
					}, {});

					// Filter out tags from current that are not in desired or are duplicates
					const removedTags = u.locationTagsUpdate?.current?.filter(tag => {
					  if (desiredTagsFrequency?.[tag]) {
					    desiredTagsFrequency[tag]--; // Decrement the count for this tag
					    return false; // Tag exists in desired, so it's not "removed"
					  }
					  return true; // Tag is not in desired or is an extra duplicate
					}) || [];
					
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
							<strong><a href="${crmSlUrl(u.id)}" target="_blank">${u.title}</strong> (${u.slId})</a>
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
  updateCommitButtonState();
}

// sync changes to CRM
async function syncTitles(state) {

	const reviewBtn = document.getElementById('reviewBtn');
	const syncBtn = document.getElementById('syncBtn');
	reviewBtn.disabled = true;
	syncBtn.disabled = true;
  state.stepFourDone = false;
  state.stepFiveDone = false;
  updateCommitButtonState();
	
	container = document.getElementById("update-records");
	container.innerHTML = 'Syncing ...';

	try {
	if (state.pendingUpdates.length) {
		const theseUpdates = state.pendingUpdates.slice(0, NUMBER_TO_UPDATE);
		const errors = await updateRecordsInBatches(theseUpdates,createTagRecord,deleteTagRecord,updateServiceListingRecord);
		console.log(`Update complete for ${theseUpdates.length}`);
		
		if (errors.length > 0) {
			// Display picklist errors
			let errorHtml = '<div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 10px 0;">';
			errorHtml += '<h4 style="color: #856404; margin-top: 0;">⚠️ Invalid Picklist Values Detected</h4>';
			errorHtml += '<p>The following records could not be fully updated because they contain location tag values that are not in the CRM picklist:</p>';
			errorHtml += '<ul>';
			errors.forEach(err => {
				errorHtml += `<li><strong>${err.recordTitle}</strong> (${err.recordId}): ${err.error}</li>`;
			});
			errorHtml += '</ul>';
			errorHtml += '<p><strong>Action Required:</strong> Either update the website listing to use valid location tags, or contact your Salesforce administrator to add these values to the Location Tag picklist.</p>';
			errorHtml += '</div>';
			
			container.innerHTML = errorHtml + '<p>Other changes for this batch have been applied. Press the Review Changes button to get the next batch.</p>';
		} else {
			container.innerHTML = '<p>Those changes are now done. Press the Review Changes button, to get the next batch.</p>';
		}
	} else {
		console.log("No updates needed");
		container.innerHTML = '<p>No updates needed.</p>';
	}
	} catch (err) {
		container.innerHTML = `<p><strong>❌ Failed.</strong> ${err.message}</p>`;
	}

	reviewBtn.disabled = false;
	syncBtn.disabled = false;
  updateCommitButtonState();
}

// update function that processes tag changes first
async function updateRecordsInBatches(updates, createTagRecord, deleteTagRecord, updateServiceListingRecord) {
  const errors = [];
  
  for (const update of updates) {
    const { id, title, locationTagsUpdate } = update;

    if (locationTagsUpdate) {
      const { current, desired } = locationTagsUpdate;

      const toAdd = desired.filter(tag => !current.includes(tag));
      
      // Create a frequency map for desired tags
      const desiredFrequency = desired.reduce((freq, tag) => {
        freq[tag] = (freq[tag] || 0) + 1;
        return freq;
      }, {});

      // Filter out tags from current that are not in desired or are duplicates
      const toRemove = current.filter(tag => {
        if (desiredFrequency[tag]) {
          desiredFrequency[tag]--; // Decrement the count for this tag
          return false; // Tag exists in desired, so it's not "removed"
        }
        return true; // Tag is not in desired or is an extra duplicate
      });

			for (const tag of toAdd) {
        try {
          await createTagRecord(id, tag);
        } catch (error) {
          if (error.message.startsWith('PICKLIST_ERROR:')) {
            errors.push({
              recordTitle: title,
              recordId: id,
              error: error.message.replace('PICKLIST_ERROR: ', '')
            });
          } else {
            throw error; // Re-throw non-picklist errors
          }
        }
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
  
  // Return any picklist errors encountered
  return errors;
}


////////////////////////////////////////////////////////
// STEP FIVE
// DATE FIELDS SYNCHRONIZATION
////////////////////////////////////////////////////////

function formatDateForCsv(dateValue) {
  if (!(dateValue instanceof Date) || Number.isNaN(dateValue.getTime())) {
    return '';
  }
  return dateValue.toISOString().split('T')[0];
}

function escapeCsvValue(value) {
  const str = String(value ?? '');
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadDateDifferencesCsv(dateUpdates) {
  if (!Array.isArray(dateUpdates) || dateUpdates.length === 0) {
    alert('No date differences to export.');
    return;
  }

  const header = [
    'Service Listing Name',
    'CRM Record URL',
    'CRM Date Last Updated on Website',
    'Squarespace Updated Date'
  ];

  const rows = dateUpdates
    .slice()
    .sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }))
    .map((update) => [
      update.title || '',
      crmSlUrl(update.id),
      formatDateForCsv(update.crmDate),
      formatDateForCsv(update.websiteDate)
    ]);

  const csvContent = [header, ...rows]
    .map((row) => row.map(escapeCsvValue).join(','))
    .join('\n');

  const now = new Date();
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0')
  ].join('') + '-' + [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `stage5-date-differences-${timestamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function parseDateOnlyInput(dateValue) {
  if (!dateValue || typeof dateValue !== 'string') {
    return null;
  }
  const trimmed = dateValue.trim();
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const parsed = new Date(year, monthIndex, day);

  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== monthIndex ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  return parsed;
}

function getStepFiveIgnoreBeforeDate() {
  const urlParams = new URLSearchParams(window.location.search);
  const urlOverride = urlParams.get('step5IgnoreBeforeDate');
  const storedOverride = oauthStorage.getItem(STEP_FIVE_IGNORE_BEFORE_DATE_KEY);
  const configuredValue = (urlOverride || storedOverride || runtimeConfig.stepFiveIgnoreBeforeDate || '').trim();
  const parsedDate = parseDateOnlyInput(configuredValue);

  if (!configuredValue || parsedDate) {
    return {
      value: configuredValue,
      date: parsedDate,
      invalid: false,
      source: urlOverride ? 'url' : storedOverride ? 'storage' : 'config'
    };
  }

  return {
    value: configuredValue,
    date: null,
    invalid: true,
    source: urlOverride ? 'url' : storedOverride ? 'storage' : 'config'
  };
}

// Find listings with date discrepancies
function findDateDiscrepancies(sfRecords, combinedFiltered) {
  const dateUpdates = [];
  let ignoredByCutoff = 0;
  const cutoffInfo = getStepFiveIgnoreBeforeDate();
  const minimumWebsiteDate = cutoffInfo.date;

  for (const item of combinedFiltered) {
    if (!item.updatedOn) continue; // Skip if no website date

    const sfRecord = sfRecords.find(
      rec => rec.Service_Listing_System_ID__c === item.salesforceId
    );

    if (!sfRecord) continue; // No matching SF record

    const websiteDate = new Date(parseInt(item.updatedOn, 10));
    if (minimumWebsiteDate && websiteDate < minimumWebsiteDate) {
      ignoredByCutoff += 1;
      continue;
    }

    const crmDate = sfRecord.Date_Last_Updated_on_Website__c 
      ? new Date(sfRecord.Date_Last_Updated_on_Website__c)
      : new Date(0); // Default to epoch if no CRM date

    // Compare only the date portion (year, month, day) - ignore time
    const websiteDateOnly = new Date(websiteDate.getFullYear(), websiteDate.getMonth(), websiteDate.getDate());
    const crmDateOnly = new Date(crmDate.getFullYear(), crmDate.getMonth(), crmDate.getDate());
    const isSignificantDiff = websiteDateOnly.getTime() !== crmDateOnly.getTime();

    if (isSignificantDiff) {
      const isAnomaly = crmDate > websiteDate;
      
      const verificationDate = sfRecord.Date_of_most_recent_verification__c
        ? new Date(sfRecord.Date_of_most_recent_verification__c)
        : new Date(0);
      
      dateUpdates.push({
        id: sfRecord.Id,
        slId: sfRecord.Service_Listing_System_ID__c,
        title: sfRecord.Service_Listing_Name__c,
        fullUrl: item.fullUrl,
        websiteDate: websiteDate,
        crmDate: crmDate,
        verificationDate: verificationDate,
        updatedOn: item.updatedOn,
        isAnomaly: isAnomaly
      });
    }
  }

  return {
    dateUpdates,
    ignoredByCutoff,
    cutoffInfo
  };
}

// Review date changes - similar to reviewChanges for Step 4
async function reviewDateChanges(state) {
  try {
    const reviewDatesBtn = document.getElementById('reviewDatesBtn');
    const syncDatesBtn = document.getElementById('syncDatesBtn');
    reviewDatesBtn.disabled = true;
    syncDatesBtn.disabled = true;
		state.stepFiveDone = false;
		updateCommitButtonState();

    const container = document.getElementById("date-updates");
    container.innerHTML = 'Checking dates...';

    // Get date discrepancies
    const dateDiscrepancyResult = findDateDiscrepancies(state.sfRecords, window.combinedFiltered);
    state.pendingDateUpdates = dateDiscrepancyResult.dateUpdates;
    console.log(`${state.pendingDateUpdates.length} date discrepancies found`);

    // Render report
    if (state.pendingDateUpdates.length === 0) {
      let html = '<p>All dates are synchronized.</p>';
      if (dateDiscrepancyResult.cutoffInfo.date) {
        html += `<p>Stage 5 filter: ignoring listings with Squarespace updated date before <strong>${dateDiscrepancyResult.cutoffInfo.value}</strong> (${dateDiscrepancyResult.ignoredByCutoff} listing${dateDiscrepancyResult.ignoredByCutoff === 1 ? '' : 's'} ignored).</p>`;
      } else if (dateDiscrepancyResult.cutoffInfo.invalid) {
        html += `<p style="color: #b42318;">Stage 5 filter ignored due to invalid date format: "${dateDiscrepancyResult.cutoffInfo.value}". Use YYYY-MM-DD.</p>`;
      }
      container.innerHTML = html;
			state.stepFiveDone = true;
    } else {
			state.stepFiveDone = false;
      const theseDateUpdates = state.pendingDateUpdates.slice(0, NUMBER_OF_CHANGES);
      
      // Separate anomalies and normal updates
      const anomalies = theseDateUpdates.filter(u => u.isAnomaly);
      const normal = theseDateUpdates.filter(u => !u.isAnomaly);
      
      let html = `
        <p><button id="downloadDateDiffCsvBtn" type="button">Download date differences as CSV</button></p>
        <p>Step 5: Synchronize website update dates with CRM records. Changes will be displayed 
           ${NUMBER_OF_CHANGES} record${NUMBER_OF_CHANGES > 1 ? 's' : ''} at a time.</p>
        <p>This batch of ${theseDateUpdates.length} CRM record${theseDateUpdates.length > 1 ? 's' : ''} that need${theseDateUpdates.length === 1 ? 's' : ''} date updates out of total of ${state.pendingDateUpdates.length}:</p>
      `;

      if (dateDiscrepancyResult.cutoffInfo.date) {
        html += `<p>Stage 5 filter: ignoring listings with Squarespace updated date before <strong>${dateDiscrepancyResult.cutoffInfo.value}</strong> (${dateDiscrepancyResult.ignoredByCutoff} listing${dateDiscrepancyResult.ignoredByCutoff === 1 ? '' : 's'} ignored).</p>`;
      } else if (dateDiscrepancyResult.cutoffInfo.invalid) {
        html += `<p style="color: #b42318;">Stage 5 filter ignored due to invalid date format: "${dateDiscrepancyResult.cutoffInfo.value}". Use YYYY-MM-DD.</p>`;
      }
      
      if (anomalies.length > 0) {
        html += '<h4>⚠️ Anomalies (CRM date is newer than website date):</h4><ol>';
        anomalies.forEach(u => {
          html += `
            <li>
              <strong><a href="${crmSlUrl(u.id)}" target="_blank">${u.title}</a></strong> (${u.slId})
              <ul>
                <li style="margin-left:1em"><strong>Date Last Updated on Website</strong>:
                  <ul>
                    <li>"${u.crmDate.toLocaleDateString()}" →</li>
                    <li>"${u.websiteDate.toLocaleDateString()}"</li>
                  </ul>
                </li>
              </ul>
            </li>
          `;
        });
        html += '</ol>';
      }
      
      if (normal.length > 0) {
        html += '<h4>📅 Out of Date (Website newer than CRM):</h4><ol>';
        normal.forEach(u => {
          html += `
            <li>
              <strong><a href="${crmSlUrl(u.id)}" target="_blank">${u.title}</a></strong> (${u.slId})
              <ul>
                <li style="margin-left:1em"><strong>Date Last Updated on Website</strong>:
                  <ul>
                    <li>"${u.crmDate.toLocaleDateString()}" →</li>
                    <li>"${u.websiteDate.toLocaleDateString()}"</li>
                  </ul>
                </li>
              </ul>
            </li>
          `;
        });
        html += '</ol>';
      }
      
      container.innerHTML = html;
      const downloadCsvBtn = document.getElementById('downloadDateDiffCsvBtn');
      if (downloadCsvBtn) {
        downloadCsvBtn.addEventListener('click', () => downloadDateDifferencesCsv(state.pendingDateUpdates));
      }
      syncDatesBtn.disabled = false;
    }

    container.style.display = "block";
  } catch (err) {
    console.error("Failed to check date discrepancies:", err);
    alert("Error while reviewing date changes. See console for details.");
  }

  reviewDatesBtn.disabled = false;
  syncDatesBtn.disabled = false;
	updateCommitButtonState();
}

// Sync date changes to CRM - similar to syncTitles
async function syncDates(state) {
  const reviewDatesBtn = document.getElementById('reviewDatesBtn');
  const syncDatesBtn = document.getElementById('syncDatesBtn');
  reviewDatesBtn.disabled = true;
  syncDatesBtn.disabled = true;
	state.stepFiveDone = false;
	updateCommitButtonState();
  
  const container = document.getElementById("date-updates");
  container.innerHTML = 'Syncing dates...';
  
  if (state.pendingDateUpdates.length) {
    const theseDateUpdates = state.pendingDateUpdates.slice(0, NUMBER_TO_UPDATE);
    
    try {
      for (const update of theseDateUpdates) {
        const updatedDate = new Date(parseInt(update.updatedOn, 10)).toISOString();
        const fieldsToUpdate = {
          Date_Last_Updated_on_Website__c: updatedDate
        };
        
        // Only update verification date if it's older than the new website date
        if (update.verificationDate < update.websiteDate) {
          fieldsToUpdate.Date_of_most_recent_verification__c = updatedDate;
        }
        
        await updateServiceListingRecord(update.id, fieldsToUpdate);
      }
      
      console.log(`Date update complete for ${theseDateUpdates.length} records`);
      
      // Refresh Salesforce records after syncing
      await fetchAllSFRecords();
      
    } catch (error) {
      console.error('Error syncing dates:', error);
      alert('Error syncing dates. Check console for details.');
    }
  } else {
    console.log("No date updates needed");
  }

  reviewDatesBtn.disabled = false;
  syncDatesBtn.disabled = false;
  
  container.innerHTML = '<p>Those date changes are now done. Press the Review Date Changes button to get the next batch.</p>';
  updateCommitButtonState();
}

async function runWorkflow() {
  const stepTwoSection = document.getElementById('steptwo');
  const stepThreeSection = document.getElementById('stepthree');
  const stepFourSection = document.getElementById('stepfour');
  const stepFiveSection = document.getElementById('stepfive');
  const reviewBtn = document.getElementById('reviewBtn');
  const syncBtn = document.getElementById('syncBtn');
  const archiveBtn = document.getElementById('archiveBtn');
  const reviewDatesBtn = document.getElementById('reviewDatesBtn');
  const syncDatesBtn = document.getElementById('syncDatesBtn');

  clearWorkflowContainers();
  state.pendingUpdates = [];
  state.pendingArchive = [];
  state.pendingDateUpdates = [];
  state.stepOneDone = false;
  state.stepTwoDone = false;
  state.stepThreeDone = false;
  state.stepFourDone = false;
  state.stepFiveDone = false;

  if (!pageContext.isEditMode) {
    if (stepTwoSection) stepTwoSection.style.display = 'none';
    if (stepThreeSection) stepThreeSection.style.display = 'none';
    if (stepFourSection) stepFourSection.style.display = 'none';
    if (stepFiveSection) stepFiveSection.style.display = 'none';
  }

  if (reviewBtn) reviewBtn.disabled = !state.accessToken;
  if (syncBtn) syncBtn.disabled = true;
  if (archiveBtn) archiveBtn.disabled = true;
  if (reviewDatesBtn) reviewDatesBtn.disabled = true;
  if (syncDatesBtn) syncDatesBtn.disabled = true;

  state.stepOneDone = !missingSysids() || pageContext.isTestMode;

  if (state.stepOneDone && stepTwoSection) {
    stepTwoSection.style.display = 'flex';

    if (state.accessToken) {
      await fetchAllSFRecords();
      const { missing, archived } = await findExtraListings(state.sfRecords, window.combinedFiltered);
      displayUnknownSysIds(missing, archived);
      state.stepTwoDone = (missing.length === 0 && archived.length === 0);
    }
  }

  state.stepTwoDone ||= pageContext.isTestMode;

  if (state.stepTwoDone && stepThreeSection) {
    stepThreeSection.style.display = 'flex';
    if (state.accessToken) {
      findRecordsToArchive(state.sfRecords, window.combinedFiltered);
      state.stepThreeDone = state.pendingArchive.length === 0;
      if (!state.stepThreeDone && archiveBtn) {
        archiveBtn.disabled = false;
      }
    }
  }

  state.stepThreeDone ||= pageContext.isTestMode && state.accessToken;

  if (state.stepThreeDone && stepFourSection) {
    stepFourSection.style.display = 'flex';
    if (state.accessToken) {
      await reviewChanges(state);
    }
  }

  if (state.stepThreeDone && state.stepFourDone && state.accessToken && stepFiveSection) {
    stepFiveSection.style.display = 'flex';
  }

  updateCommitButtonState();
}
////////////////////////////////////////////////////////
// MAIN ROUTINE
// page loaded, check access token, 
// start processing the steps as far as is possible
////////////////////////////////////////////////////////

// Initialize everything after DOM is ready
window.addEventListener('load', async () => {

	// Check for the "test" query parameter
  const urlParams = new URLSearchParams(window.location.search);
  pageContext.isTestMode = urlParams.get('test') === 'true';
  
  // Check if we're in Squarespace edit mode (editing at ataloss.squarespace.com)
  pageContext.isEditMode = window.location.hostname === 'ataloss.squarespace.com';
	pageContext.isAtalossDomain = window.location.hostname === 'www.ataloss.org';
	ensureDataActionsUi();
  applySquarespaceRuntimeConfig();
  persistStepFiveCutoffFromUrl();

	// get button elements
	const loginBtn = document.getElementById('loginBtn');
	const reviewBtn = document.getElementById('reviewBtn');
	const syncBtn = document.getElementById('syncBtn');
	const archiveBtn = document.getElementById('archiveBtn');
	const gatherBtn = document.getElementById('gatherDataBtn');
	const commitBtn = document.getElementById('commitGithubBtn');

	const unknownSysIdsDiv = document.getElementById("unknown-sysids");
  const oauthError = getOAuthError();
  if (oauthError) {
    console.error('Salesforce OAuth error:', oauthError.error, oauthError.errorDescription);
    unknownSysIdsDiv.innerHTML = `<p style="color: red;"><strong>Salesforce OAuth error:</strong> ${oauthError.error}${oauthError.errorDescription ? ` — ${oauthError.errorDescription}` : ''}</p>`;
    unknownSysIdsDiv.style.display = 'block';
  }

  try {
    const didExchangeCode = await handleOAuthCodeCallback();
    if (didExchangeCode) {
      console.log('OAuth authorization code exchanged successfully');
    }
  } catch (error) {
    console.error('Salesforce OAuth callback failed:', error);
    unknownSysIdsDiv.innerHTML = `<p style="color: red;"><strong>Salesforce OAuth callback failed:</strong> ${error.message}</p>`;
    unknownSysIdsDiv.style.display = 'block';
    state.accessToken = null;
    state.instanceUrl = null;
  }

	// Extract token from hash and validate it
  if (state.accessToken && state.instanceUrl) {
    reviewBtn.disabled = false;
    loginBtn.disabled = true;
  } else if (window.location.hash.includes('access_token')) {
		const tokenInfo = getTokenFromHash();
		state.accessToken = tokenInfo.accessToken;
		state.instanceUrl = tokenInfo.instanceUrl;

		// Test the token by making a lightweight Salesforce API call
		fetch(`${state.instanceUrl}/services/data/v63.0/`, {
			headers: {
				'Authorization': `Bearer ${state.accessToken}`
			}
		})
		.then(response => {
			if (response.ok) {
				console.log("Authenticated with Salesforce");
				reviewBtn.disabled = false;   // Enable Review
				loginBtn.disabled = true;     // Disable Login
        updateCommitButtonState();
			} else {
				throw new Error("Access token invalid");
			}
		})
		.catch(error => {
			console.error("Salesforce auth failed:", error);
			state.accessToken = null;
			state.instanceUrl = null;
			reviewBtn.disabled = true;
      updateCommitButtonState();

			// Clean up URL to remove token
			window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
			});
  } else if (!pageContext.isAtalossDomain) {
		if (loginBtn) loginBtn.disabled = true;
    unknownSysIdsDiv.innerHTML = '<p style="color: red;"><strong>You can only connect to the CRM if viewing this page under the www.ataloss.org domain.</strong></p>';
    unknownSysIdsDiv.style.display = 'block';
	} 

	// Button event listeners
	loginBtn.addEventListener('click', loginWithSalesforce);
	reviewBtn.addEventListener('click', () => reviewChanges(state));
	syncBtn.addEventListener('click', () => syncTitles(state));
	archiveBtn.addEventListener('click', () => archiveRecords(state));
  if (gatherBtn) gatherBtn.addEventListener('click', gatherCurrentData);
  if (commitBtn) commitBtn.addEventListener('click', commitGatheredDataToGitHub);
	const reviewDatesBtn = document.getElementById('reviewDatesBtn');
	const syncDatesBtn = document.getElementById('syncDatesBtn');
	if (reviewDatesBtn) reviewDatesBtn.addEventListener('click', () => reviewDateChanges(state));
	if (syncDatesBtn) syncDatesBtn.addEventListener('click', () => syncDates(state));

  await runWorkflow();
  if (!pageContext.isAtalossDomain) {
    unknownSysIdsDiv.innerHTML = '<p style="color: red;"><strong>You can only connect to the CRM if viewing this page under the www.ataloss.org domain.</strong></p>';
    unknownSysIdsDiv.style.display = 'block';
  }
  updateCommitButtonState();

});



