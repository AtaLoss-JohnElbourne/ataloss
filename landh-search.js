const BASE_URL = window.location.origin;

window.addEventListener("load", async function () {
	
	$.noConflict();

	const dropdownKeys = [
		{ key: "catType", selector: ".resource-type select" },
		{ key: "catTheme", selector: ".theme select" },
		{ key: "catRelig", selector: ".religious-content select" },
	];
	
	const sections = [ 'recommended', 'approved', 'all' ];

	const screenSections = [];
	const filteredData = [];
	const displayedData = [];
	const totalResultsElement = [];
	sections.forEach((section) => {
        screenSections[section] = document.querySelector(`.${section}-section-wrapper`);
        filteredData[section] = [];
        displayedData[section] = [];
        totalResultsElement[section] = document.querySelector(`.${section}-count span`);
    });
	
	const loadingScreen = document.getElementById("loading-screen");

	const itemsPerLoad = 30; // Number of items to load initially and for each "Load More"

	async function getResourcesData() {
		const format = "format=json-pretty";
		const jsonPath = BASE_URL + "/resources?offset=";
		accumulatedData = [];
		let page = 0;
		let baseUrl = '';
		try {
			offset = 9999999999999;
			const seenIds = new Set();
			while(true) {
				page += 1;
				url = jsonPath + offset + "&" + format;
				console.log("URL: " + url);
				console.log(`Fetching page ${page}, Services so far: ${accumulatedData.length}`);
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
			console.log("Error fetching data: " + error.message);
			return;
		}
		console.log("Finished loading resource listings: " + accumulatedData.length);
		return accumulatedData;
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

	function sortWithAllFirst(arr, keyword = "All") {
			if (!arr.includes(keyword)) {
				arr.push(keyword);
			}
			return arr.slice().sort((a, b) => {
			if (a === keyword) return -1;
			if (b === keyword) return 1;
			return a.localeCompare(b);
		});
	}
	
	function prepareResourceData(resourcesData) {
        window.wholeCategories = {};
        let catType = [], typeCat = [], catTheme = [], themeCat = [], catRelig = [], religionCat = [];
        let recommendedData = [], approvedData = [], allData = [];
        resourcesData.forEach((item) => {
            catType = extractedData("Typ:", item.categories);
            catTheme = extractedData("The:", item.categories);
            catRelig = extractedData("Rel:", item.categories);
            requiredData = [{
                id: item.id,
                fullUrl: item.fullUrl,
                title: item.title,
                excerpt: item.excerpt,
                featured: item.starred,
                publishOn: item.publishOn,
                updatedOn: item.updatedOn,
                catType: catType,
                catTheme: catTheme,
                catRelig: catRelig,
                body: item.body,
            }];

            typeCat = [...new Set([...typeCat, ...catType])];
            themeCat = [...new Set([...themeCat, ...catTheme])];
            religionCat = [...new Set([...religionCat, ...catRelig])];

            if (item.categories.includes("Level:Recommended")) {
                recommendedData.push(...requiredData);
            } else if (item.categories.includes("Level:Approved")) {
                approvedData.push(...requiredData);
            }
            allData.push(...requiredData);
        });

        window.wholeCategories = {
            catType: sortWithAllFirst(typeCat),
            catTheme: sortWithAllFirst(themeCat),
            catRelig: sortWithAllFirst(religionCat),
        };

        console.log(window.wholeCategories);
		
		recommendedData.sort((a, b) => a.title.localeCompare(b.title));
		approvedData.sort((a, b) => a.title.localeCompare(b.title));
		allData.sort((a, b) => a.title.localeCompare(b.title));
		
		window.sectionData = [];
		window.sectionData['recommended'] = recommendedData;
		window.sectionData['approved'] = approvedData;
		window.sectionData['all'] = allData;
		
		console.log("Recommended Resources: " + recommendedData.length);
		console.log("Approved    Resources: " + approvedData.length);
		console.log("All         Resources: " + allData.length);
	}

	async function initialise() {

		// Show the loading screen
		loadingScreen.classList.remove("loading-hidden");
		loadingScreen.classList.add("loading-visible");

		// load the resources data
		resources = await getResourcesData();
		prepareResourceData(resources);

		dropdownKeys.forEach((item) => {
			populateDropdown(
				document.querySelector(item.selector),
				window.wholeCategories[item.key]
			);
			initializeSingleSelect(document.querySelector(item.selector), item.key, "All");
		});

		// Initially display results
		filterResults();

		// hide loading screen
		loadingScreen.classList.remove("loading-visible");
		loadingScreen.classList.add("loading-hidden");
	}

	function populateDropdown(element, options) {
		try {
			if (!element) throw new Error("Dropdown element not found");

			// Reset dropdown
			element.innerHTML = "";

			// Sort options alphabetically
			options.forEach((option) => {
				const optionElement = document.createElement("option");
				optionElement.value = option;
				optionElement.textContent = option;
				element.appendChild(optionElement);
			});
		} catch (error) {
			console.error("Error populating dropdown:", error);
			showError("Error populating dropdown, please check the data.");
		}
	}

	function getQueryParam(name) {
		const urlParams = new URLSearchParams(window.location.search);
		return urlParams.get(name); // Returns the value of the parameter
	}

	function initializeSingleSelect(element, paramName, defaultValue) {
		jQuery(element).selectpicker("refresh");
		jQuery(element).selectpicker({
			noneSelectedText: "Select an option",
			liveSearch: true,
			actionsBox: false,
		});

		// Get the GET parameter value
		const preselectValue = getQueryParam(paramName) || defaultValue; // Default to "ALL" if no parameter is found

		// Select the preselected or default value
		if (preselectValue) {
			jQuery(element).val(preselectValue).selectpicker("refresh");
		}
	}


	function displayResults(section,data) {

		cards = "";

		// Iterate through filtered data and append to respective sections

		data.forEach((item) => {
			const card = `
			 <div class="card border border-bottom-0 flex-fill h-100">
				 <div class="card-body p-4">
					 <h5 class="card-title fw-bold">${item.title}</h5>
					 <div class='card-text-description'>
						 <p class="card-text">${stripHtmlAndLimit(item.excerpt, 500) || ""
				}</p>
					 </div>
					 <button
						 class="btn read-more mt-3 btn-outline-secondary"
						 data-bs-toggle="modal"
						 data-id="${item.id}"
						 data-bs-target="#descriptionModal"
						 data-content="${"No description available."}">
						 Read More
					 </button>
					 <div class='card-description-hidden d-none' id="cardDescription"><p>No description available.</p></div>
				 </div>
			 </div>
			`;

			cards += card;
		});

		screenSections[section].innerHTML = cards;
	}


	// clean up excerpt
	function stripHtmlAndLimit(text, limit) {
		// Create a temporary DOM element to strip HTML tags
		const tempDiv = document.createElement("div");
		tempDiv.innerHTML = text;
		const plainTextNonTrimmed =
			tempDiv.textContent || tempDiv.innerText || "";
		const plainText = plainTextNonTrimmed.trim();
		// Check if the text needs truncation
		if (plainText.length > limit) {
			// Find the last space within the limit to avoid cutting a word
			let truncatedText = plainText.substring(0, limit);
			const lastSpaceIndex = truncatedText.lastIndexOf(" ");
			if (lastSpaceIndex > -1) {
				truncatedText = truncatedText.substring(0, lastSpaceIndex);
			}
			return truncatedText + " ...";
		}
		return plainText;
	}

	function updateTotalResults(section,count) {
		totalResultsElement[section].textContent = count;
	}

	function throttle(func, limit) {
		let lastFunc;
		let lastRan;
		return function () {
			const context = this, args = arguments;
			if (!lastRan) {
				func.apply(context, args);
				lastRan = Date.now();
			} else {
				clearTimeout(lastFunc);
				lastFunc = setTimeout(function () {
					if ((Date.now() - lastRan) >= limit) {
						func.apply(context, args);
						lastRan = Date.now();
					}
				}, limit - (Date.now() - lastRan));
			}
		};
	}

	// scroll event handling
	document.querySelectorAll(
			".recommended-section-wrapper, .approved-section-wrapper, .all-section-wrapper"
		).forEach((sectionElement) => {
			sectionElement.addEventListener("scroll", throttle(async function () {
				
				const scrollTop = this.scrollTop;
				const scrollHeight = this.scrollHeight;
				const clientHeight = this.clientHeight;

				if (scrollTop + clientHeight >= scrollHeight - 10) {
					if (this.className.match(/(\S+)-section-wrapper/)) {
						section = this.className.match(/(\S+)-section-wrapper/)[1];
					}

					// Load more data
					const startIndex = displayedData[section].length;
					const nextBatch = filteredData[section].slice(startIndex, startIndex + itemsPerLoad);
					displayedData[section] = [...displayedData[section], ...nextBatch];

					// Update UI
					displayResults(section,displayedData[section], true);
					//updateTotalResults(section,filteredData[section].length);

				}
			}, 200)); // Throttling to run every 200ms
		});

	// clear filters handling
	document.getElementById("clear-filters").addEventListener("click", () => {
		dropdownKeys.forEach(({ selector }) => {
			const dropdownElement = document.querySelector(selector);
			jQuery(dropdownElement).selectpicker('val', 'All');
			jQuery(dropdownElement).selectpicker("refresh");
		});

		// Remove filters from the URL
		history.replaceState(null, "", window.location.pathname);

		sections.forEach((section) => {
			filteredData[section] = window.sectionData[section];
			displayedData[section] = filteredData[section].slice(0, itemsPerLoad);
			displayResults(section,displayedData[section]);
			updateTotalResults(section,filteredData[section].length);
		});
	});

	document.querySelectorAll('#resultsTabs button[data-bs-toggle="tab"]').forEach(btn => {
  	btn.addEventListener('shown.bs.tab', function (e) {
			const targetId = e.target.getAttribute('data-bs-target').replace('#', '');

			// Loop through all col-md-4 blocks
			document.querySelectorAll('.content-results-mobile-desktop .col-md-4').forEach(col => {
				const pane = col.querySelector('.tab-pane');
				if (pane && pane.id === targetId) {
					col.style.display = 'block';
				} else {
					col.style.display = 'none';
				}
			});
		});
	});

	// Handle the "Read More" button click
	jQuery(document).on("click", ".read-more", function () {
		// Find the sibling .content-hidden div
		const contentElement = jQuery(this).siblings("#cardDescription");
		const titleElement = jQuery(this)
			.closest(".card-body")
			.find(".card-title");
		var selectedItemHTML = "";
		const uniqueId = jQuery(this).data("id");

		// Find the corresponding item
		let selectedItem;
		sections.some((section) => {
			selectedItem = window.sectionData[section].find(
				(item) => item.id === uniqueId
			);
			return !!selectedItem; // Stops iteration when a match is found
		});		

		selectedItemHTML = selectedItem.body;

		// Update modal title dynamically
		if (titleElement.length > 0) {
			jQuery("#descriptionModalLabel").text(titleElement.text());
		} else {
			jQuery("#descriptionModalLabel").text("Details"); // Fallback title
		}

		// Check if the content element exists
		if (selectedItemHTML.length > 0) {
			// Load the sibling content into the modal
			jQuery("#descriptionModal .modal-body").html(selectedItemHTML);
		} else {
			jQuery("#descriptionModal .modal-body").html(
				"<p>No description available.</p>"
			);
		}
	
		// display the modal properly
		jQuery("#descriptionModal").appendTo("body")
	});

	// Ensure modal-backdrop is appended correctly
	jQuery(document).on("show.bs.modal", function () {
		jQuery(".modal-backdrop").appendTo("body");
	});

	// use submit button instead
	document.getElementById("submit-btn").addEventListener("click", () => {
		if(filterResults()) {
		
			// scroll to different elements depending on mobile or desktop view
			var element = document.querySelector('#resultsTabs');
			if(element && isHidden(element)) {
				element = document.querySelector('.scroll-implementation');
			}
			
			if (element) {
				// Scroll to the element, positioning it near the top
				window.scrollTo({
					top: element.getBoundingClientRect().top + window.scrollY - 20, // 20px offset from the top
					behavior: 'smooth' // Smooth scrolling animation
				});
			}
		}
	});

	// Where el is the DOM element you'd like to test for visibility
	function isHidden(el) {
		var style = window.getComputedStyle(el);
		return (style.display === 'none')
	}
	
	function filterResults() {
		try {
			const filters = {};
			dropdownKeys.forEach(({ key, selector }) => {
				const selectedValues = getSelectedValues(selector);
				if (selectedValues !== null) filters[key] = selectedValues;
			});

			var totalCount = 0;

			sections.forEach((section) => {
				filteredData[section] = window.sectionData[section].filter((item) => {
					return Object.entries(filters).every(([key, values]) => {
						let categoryArray = Array.isArray(item[key])
							? item[key]
							: item[key]
								? [item[key]]
								: [];

						// If the item is tagged with "All", always match
						if (categoryArray.some((cat) => cat.trim().toLowerCase() === "all")) {
							return true;
						}

						// If filter includes "All", allow all items for this key
						if (values.includes("All")) {
							return true;
						}

						return values.some((value) =>
							categoryArray.some(
								(cat) => cat.trim().toLowerCase() === value.trim().toLowerCase()
							)
						);
					});
				});


				displayedData[section] = filteredData[section].slice(0, itemsPerLoad);
				totalCount += filteredData[section].length;
				displayResults(section,displayedData[section], true);
				updateTotalResults(section,filteredData[section].length);
			})
			
			// display "no results" if necessary
			const noResultsWrapper = document.querySelector(".no-results-wrapper");

			if (totalCount === 0) {
				noResultsWrapper.classList.remove("d-none"); // Hide if count is 0
			} else {
				noResultsWrapper.classList.add("d-none"); // Show if count > 0
			}			
			
			return totalCount > 0;
			
		} catch (error) {
			console.error("Error filtering results:", error);
			showError("Error filtering results, please try again.");
		}
	}

	function getSelectedValues(selector) {
		const selectedOptions = Array.from(
			document.querySelector(selector).selectedOptions
		);
		const values = selectedOptions.map((option) => option.value);
		return values.length === 0 || values.includes("--") || values[0] === 'ALL' ? null : values;
	}

	initialise();
	
});
