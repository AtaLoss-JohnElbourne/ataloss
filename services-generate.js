const USERNAME = 'AtaLoss-JohnElbourne';
const REPO = 'ataloss';
const BRANCH = 'main';
const FILE_PATH = window.servicesDataFileName || 'services-data.js';
const COMMIT_MESSAGE = 'Services Data Update';
const BASE_URL = window.location.origin;
const SCRIPT_VERSION = '2026-03-27.1';

window.addEventListener("load", function () {

	function logToPopup(msg) {
	  const p = document.createElement("p");
	  p.style.margin = "0 0 10px";
	  p.textContent = msg;
	  const logArea = getLogArea();
	  logArea.appendChild(p);
	  logArea.scrollTop = logArea.scrollHeight;
	}

	function appendProgressDot(progressId, initialText) {
		const logArea = getLogArea();
		let p = logArea.querySelector(`[data-progress-id="${progressId}"]`);
		if (!p) {
			p = document.createElement("p");
			p.style.margin = "0 0 10px";
			p.setAttribute("data-progress-id", progressId);
			p.textContent = initialText;
			logArea.appendChild(p);
		}
		p.textContent += '.';
		logArea.scrollTop = logArea.scrollHeight;
	}

	function showCloseButton() {
	  const btn = document.createElement("button");
	  btn.textContent = "Close";
	  btn.style.marginTop = "10px";
	  const popup = getPopup();
	  btn.onclick = () => popup.remove();
	  popup.appendChild(btn);
	}

	function extractedData(delimiter, dataArrays) {
		const combinedData = [];
		dataArrays.forEach((data) => {
			if (data.includes(delimiter) && data.split(delimiter)[1].trim() !== "") {
				combinedData.push(data.split(delimiter)[1].trim());
			}
		});
		return [...new Set(combinedData)];
	}

	async function getServicesData() {
		logToPopup('Fetching Service Listings Blog Entries - paginated');
		
		const format = "format=json-pretty";
		const jsonPath = BASE_URL + "/more-info/bereavement-services?offset=";
		accumulatedData = [];
		let page = 0;
		let baseUrl = '';
		try {
			offset = 9999999999999;
			const seenIds = new Set();
			while(true) {
				page += 1;
				url = jsonPath + offset + "&" + format;
				logToPopup(`Fetching page ${page}, Services so far: ${accumulatedData.length}`);
				const response = await fetch(url);
				if (!response.ok) {
					throw new Error(`HTTP error! Status: ${response.status}`);
				}
				const data = await response.json();
				// save baseUrl to create links for each listing
				if (page == 1) {
					baseUrl = data.website.baseUrl;
				}
				if (data.items && data.items.length > 0) {
					for (const item of data.items) {
						if (!seenIds.has(item.id)) {
							seenIds.add(item.id);
							// add base URL to create actual link
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
		} catch (error) {
			logToPopup("Error fetching data: " + error.message);
			return;
		}
		logToPopup("Finished loading service listings: " + accumulatedData.length);
		return accumulatedData;
	}

	function extractSalesforceIdAndCleanBody(body) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(body, "text/html");
		let salesforceId = null;

		// Find all <p> tags
		doc.querySelectorAll("p").forEach(p => {
			const match = p.textContent.trim().match(/^\[(\w{15})\]$/);
			if (match) {
				salesforceId = match[1]; // Extract ID
				p.remove(); // Remove <p> that contains ONLY the ID
			}
		});

		return {
			salesforceId,
			cleanedBody: doc.body.innerHTML.trim()
		};
	}

	function generateJavascript(servicesData) {
		let wholeCategories = {};
		let catWho = [], whoCat = [], catCDeath = [], cDeathCat = [], catAgePerson = [], agePersonCat = [], catLocation = [], locationCat = [], catType = [], typeCat = [];
		let featuredData = [], nationalData = [], regionalData = [];
		servicesData.forEach((item) => {
			catWho = extractedData("Who:", item.categories);
			catCDeath = extractedData("Cir:", item.categories);
			catAgePerson = extractedData("Age:", item.categories);
			catLocation = extractedData("Location:", item.categories);
			catType = extractedData("Type:", item.categories);
			requiredData = [{
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
				...(() => {
					const { salesforceId, cleanedBody } = extractSalesforceIdAndCleanBody(item.body);
					return {
						salesforceId,
						body: cleanedBody
					};
				})()
			}];
			whoCat = [...new Set([...whoCat, ...catWho])];
			cDeathCat = [...new Set([...cDeathCat, ...catCDeath])];
			agePersonCat = [...new Set([...agePersonCat, ...catAgePerson])];
			locationCat = [...new Set([...locationCat, ...catLocation])];
			typeCat = [...new Set([...typeCat, ...catType])];
			if (item.starred) featuredData.push(...requiredData);
			if (catLocation.includes("NATIONAL ORGANISATIONS")) {
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
		logToPopup("Featured Services: " + featuredData.length);
		logToPopup("Regional Services: " + regionalData.length);
		logToPopup("National Services: " + nationalData.length);
		logToPopup("Total    Services: " + (regionalData.length + nationalData.length));
		
		if (featuredData.length < 10 || regionalData.length < 1300 || nationalData.length < 150) {
			throw new Error(`Error retrieving services - the counts are too low`);
		}
		
		
		content = '// Auto generated file with services data for the sevices search tool at\n';
		content += '// https://ataloss.squarespace.com/bereavement-services\n\n';
		content += `window.wholeCategories = ${JSON.stringify(wholeCategories, null, 2)};\n\n`;
		featuredData.sort((a, b) => a.title.localeCompare(b.title));
		nationalData.sort((a, b) => a.title.localeCompare(b.title));
		regionalData.sort((a, b) => a.title.localeCompare(b.title));
		content += 'window.sectionData = [];\n\n';
		content += `window.sectionData['featured'] = ${JSON.stringify(featuredData, null, 2)};\n\n`;
		content += `window.sectionData['national'] = ${JSON.stringify(nationalData, null, 2)};\n\n`;
		content += `window.sectionData['regional'] = ${JSON.stringify(regionalData, null, 2)};\n\n`;
		logToPopup("Generated JavaScript data file: " + content.length + " bytes");
		return content;
	}

	async function getGitHubSha(githubToken) {
		const url = `https://api.github.com/repos/${USERNAME}/${REPO}/contents/${FILE_PATH}?ref=${BRANCH}`;
		const res = await fetch(url, {
			headers: {
				'Authorization': `Bearer ${githubToken}`,
				'Accept': 'application/vnd.github+json'
			}
		});
		if (!res.ok) {
			throw new Error(`Wrong GitHub token`);
		}
		const data = await res.json();
		return data.sha;
	}

	async function updateGitHub(githubToken, base64Content, commitMessage) {
		logToPopup('Uploading file to GitHub ...');
		const url = `https://api.github.com/repos/${USERNAME}/${REPO}/contents/${FILE_PATH}`;
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
				branch: BRANCH
			};

			const res = await fetch(url, {
				method: 'PUT',
				headers,
				body: JSON.stringify(body)
			});
			const data = await res.json();

			if (res.ok) {
				logToPopup('✅ File updated to GitHub: ' + data.content.path);
				const newSha = data.commit.sha;

				const commitRes = await fetch(`https://api.github.com/repos/${USERNAME}/${REPO}/commits/${newSha}`, {
					headers: {
						'Authorization': `Bearer ${githubToken}`,
						'Accept': 'application/vnd.github+json'
					}
				});

				const commitData = await commitRes.json();
				const fileStats = commitData.files.find(f => f.filename === FILE_PATH);
				if (fileStats) {
					logToPopup(`✅ File updated: +${fileStats.additions}, -${fileStats.deletions}, Δ${fileStats.changes}`);
				} else {
					logToPopup("✅ No changes");
				}
				return newSha;
			}

			const message = data?.message || 'Unknown GitHub API error';
			if (res.status === 409 && attempt < 2) {
				logToPopup('ℹ️ SHA changed on GitHub, retrying upload with latest version...');
				currentSha = await getGitHubSha(githubToken);
				continue;
			}

			throw new Error(message);
		}

		throw new Error('Upload failed after retry.');
	}

	async function waitForPagesPublish(githubToken) {
		logToPopup('⏳ Waiting for GitHub Pages to publish...');
		const maxAttempts = 30;
		const intervalMs = 10000;
		await waitForPagesWorkflowPublish(githubToken, maxAttempts, intervalMs);
	}

	async function waitForPagesWorkflowPublish(githubToken, maxAttempts = 30, intervalMs = 10000) {
		const runsUrl = `https://api.github.com/repos/${USERNAME}/${REPO}/actions/runs?branch=${BRANCH}&per_page=10`;
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
				logToPopup(`⚠️ Could not check Actions workflow status (${res.status}) — skipping wait.`);
				return;
			}

			const data = await res.json();
			const run = (data.workflow_runs || []).find(r => {
				const name = (r.name || '').toLowerCase();
				const path = (r.path || '').toLowerCase();
				return name.includes('pages build and deployment') || path.includes('pages');
			});

			if (!run) {
				logToPopup(`Waiting for Pages workflow run to appear (attempt ${i + 1}/${maxAttempts})`);
				continue;
			}

			const status = run.status;
			const conclusion = run.conclusion;

			if (status === 'queued' || status === 'in_progress') {
				appendProgressDot('pages-workflow', 'Pages workflow in progress');
			}

			if (status === 'completed' && conclusion === 'success') {
				logToPopup('✅ GitHub Pages published (via Actions workflow).');
				return;
			}

			if (status === 'completed' && conclusion && conclusion !== 'success') {
				throw new Error('GitHub Pages workflow failed: ' + conclusion);
			}
		}

		logToPopup('⚠️ Timed out waiting for GitHub Pages workflow completion.');
	}

	function getLogArea() {
		return document.getElementById('logPopup');
	}
	
	function getPopup() {
		return document.getElementById('popup');
	}
	
	document.getElementById("downloadBtn").addEventListener("click", () => {

		(async () => {
			try {

				// Create a popup window
				const popup = document.createElement("div");
				popup.id = "popup";
				popup.style.position = "fixed";
				popup.style.top = "20px";
				popup.style.right = "20px";
				popup.style.backgroundColor = "#333";
				popup.style.color = "#fff";
				popup.style.padding = "20px";
				popup.style.borderRadius = "8px";
				popup.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
				popup.style.fontFamily = "sans-serif";
				popup.style.maxWidth = "1000px";
				popup.style.zIndex = 10000;
				popup.style.fontSize = "14px";

				const logArea = document.createElement("div");
				logArea.id = "logPopup";
				logArea.style.maxHeight = "800px";
				logArea.style.overflowY = "auto";

				document.body.appendChild(popup);
				popup.appendChild(logArea);
				logToPopup(`Generator script version: ${SCRIPT_VERSION}`);
				logToPopup('Generating Services Data Cache File');

				const githubToken = document.getElementById('patPassword').value;
				const servicesData = await getServicesData();
				if (servicesData.length > 0) {
					const content = generateJavascript(servicesData);
					const base64Content = btoa(unescape(encodeURIComponent(content)));
					const commitSha = await updateGitHub(githubToken, base64Content, COMMIT_MESSAGE);
					if (commitSha) {
						await waitForPagesPublish(githubToken);
						logToPopup("✅ Update complete.");
					}
				}
				showCloseButton();
			} catch (err) {
				logToPopup('🚨 Error: ' + err.message);
				showCloseButton();
			}
		})();
	});
});
