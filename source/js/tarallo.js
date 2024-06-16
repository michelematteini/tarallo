
class TaralloClient {

	allColorNames = [];
	labelNames = [];
	labelColors = [];
	draggedCard = null;
	draggedCardList = null;
	openCardCache = [];
	coverImageObserver = null;

	Startup() {
		// set mobile class 
		if (TaralloUtils.IsMobileDevice()) {
			document.body.classList.add("mobile");
		}
		// paste (ctrl+v) event handler
		document.onpaste = (e) => this.UiPaste(e);
		// create an observer to lazy-load card cover images
		this.coverImageObserver = new IntersectionObserver((entries, observer) => this.OnImgElemVisible(entries, observer));

		// check with the server what should be displayed
		this.ReloadContent(); 
	}

	OnImgElemVisible(entries, observer) {
		for (const e of entries) {
			if (!e.isIntersecting) {
				continue;
			}

			// trigger img source loading
			const imgElem = e.target;
			imgElem.src = imgElem.dataset.src;
			imgElem.classList.remove("lazy");
			observer.unobserve(imgElem);
		}
	}

	// request the server the current page
    ReloadContent() {
        TaralloServer.Call("GetCurrentPage", {}, (response) => this.LoadPage(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
    }

	SetBackground(backgroundUrl, tiled) {
		const backgroundImgStyle = "url(\"" + backgroundUrl + "\")";
		document.body.style.backgroundImage = backgroundImgStyle;
		if (tiled) {
			document.body.classList.remove("nontiled-bg");
		} else {
			document.body.classList.add("nontiled-bg");
		}
	}

	// manages the submit event for the login form
	UiLogin() {
		let args = {};
		args["username"] = document.getElementById("login-username").value;
		args["password"] = document.getElementById("login-password").value;
		TaralloServer.Call("Login", args, () => this.ReloadContent(), (msg) => this.ShowErrorPopup(msg, "login-error"));
	}

	OnSuccessfulRegistration(jsonResponseObj) {
		this.LoadLoginPage();
		document.getElementById("login-username").value = jsonResponseObj["username"];
		this.ShowInfoPopup("Account successfully created, please login!", "login-error");
	}

	UiRegister() {
		let args = {};
		args["username"] = document.getElementById("login-username").value;
		args["password"] = document.getElementById("login-password").value;
		args["display_name"] = document.getElementById("login-display-name").value;
		TaralloServer.Call("Register", args, (response) => this.OnSuccessfulRegistration(response), (msg) => this.ShowErrorPopup(msg, "register-error"));
	}

	UiLogout() {
		TaralloServer.Call("Logout", {}, () => this.ReloadContent());
	}

	UiOpenCard(cardID) {

		if (!navigator.onLine) {
			// offline, read from cache if available
			if (this.openCardCache[cardID] !== undefined) {
				this.LoadOpenCard(this.openCardCache[cardID]);
				this.ShowErrorPopup("No connection, card displayed from cache!", "page-error");
			} else {
				this.ShowErrorPopup("No connection!", "page-error");
			}
			return;
		} 
		
		TaralloServer.Call("OpenCard", { "id": cardID }, (response) => this.LoadOpenCard(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	// loads the login page as the page content
	LoadLoginPage(contentObj) {
		// fill page content with the login form
		TaralloUtils.ReplaceContentWithTemplate("tmpl-login", {});
		document.title = "Tarallo - Login";

		// setup login button event
		const formNode = document.querySelector("#login-form");
		TaralloUtils.SetEventBySelector(formNode, "#login-btn", "onclick", () => this.UiLogin());
		TaralloUtils.SetEventBySelector(formNode, "#register-page-btn", "onclick", () => this.LoadRegisterPage());
	}

	LoadRegisterPage() {
		// fill page content with the registration form
		TaralloUtils.ReplaceContentWithTemplate("tmpl-register", {});
		document.title = "Tarallo - Register";

		// setup login button event
		const formNode = document.querySelector("#login-form");
		TaralloUtils.SetEventBySelector(formNode, "#register-btn", "onclick", () => this.UiRegister());
		TaralloUtils.SetEventBySelector(formNode, "#login-page-btn", "onclick", () => this.LoadLoginPage());
	}

	LoadBoardTile(boardData) {
		const boardListElem = document.getElementById("boards");
		const closedListElem = document.getElementById("closed-boards");
		const createBoardBtn = document.getElementById("new-board-btn");

		if (boardData["closed"]) {
			// add a tile for a closed board
			const newBoardTileElem = TaralloUtils.LoadTemplate("tmpl-closed-boardtile", boardData);
			closedListElem.appendChild(newBoardTileElem);
		} else {
			// add tile for a normal board
			const newBoardTileElem = TaralloUtils.LoadTemplate("tmpl-boardtile", boardData);
			boardListElem.insertBefore(newBoardTileElem, createBoardBtn);
			TaralloUtils.SetEventBySelector(newBoardTileElem, ".delete-board-btn", "onclick", () => this.UiCloseBoard(boardData["id"], newBoardTileElem));
		}
	}

	// load a page with the list of the board tiles for each user
	LoadBoardListPage(contentObj) {
		TaralloUtils.ReplaceContentWithTemplate("tmpl-boardlist", contentObj);
		document.title = "Tarallo - Boards";
		const boards = contentObj["boards"];
		for (let i = 0; i < boards.length; i++) {
			this.LoadBoardTile(boards[i]);
		}
		// add events
		TaralloUtils.SetEventById("new-board-btn", "onclick", () => this.UiCreateNewBoard());
		TaralloUtils.SetEventById("trello-import-btn", "onclick", () => this.UiImportFromTrello());
	}

	LoadLabel(templateName, labelName, labelColor, additionalParams = []) {
		const labelData = additionalParams;
		labelData["name"] = labelName;
		labelData["color"] = labelColor;
		return TaralloUtils.LoadTemplate(templateName, labelData);
	}

	LoadCard(cardData) {
		const newCardElem = TaralloUtils.LoadTemplate("tmpl-card", cardData);
		const coverImgElem = newCardElem.querySelector("img");

		// display moved date if available
		if (cardData["last_moved_date"] !== undefined) {
			newCardElem.querySelector(".card-moved-date").classList.remove("hidden");
		}

		if (cardData["cover_img_url"]) {
			// set cover image
			coverImgElem.setAttribute("data-src", cardData["cover_img_url"]);
			// add callback for lazy-loading cover image
			if (this.coverImageObserver) {
				this.coverImageObserver.observe(coverImgElem);
			}
		} else {
			// remove cover image
			newCardElem.removeChild(coverImgElem);
		}

		// load labels
		const labelListElem = newCardElem.querySelector(".card-labellist");
		let labelMask = cardData["label_mask"];
		if (labelMask > 0) {
			labelListElem.classList.remove("hidden");

			for (let i = 0; labelMask > 0; i++, labelMask = labelMask >> 1) {
				if (labelMask & 0x01) {
					const labelAdditionalParams = { "card-id": cardData["id"], "index": i };
					const labelElem = this.LoadLabel("tmpl-card-label", this.labelNames[i], this.labelColors[i], labelAdditionalParams);
					labelListElem.appendChild(labelElem);
				}
			}
		}

		// events
		newCardElem.onclick = () => this.UiOpenCard(cardData["id"]);
		newCardElem.ondragstart = (e) => this.UiDragCardStart(e);
		newCardElem.ondragenter = (e) => this.UiDragCardEnter(e);
		newCardElem.ondragover = (e) => e.preventDefault();
		newCardElem.ondragleave = (e) => this.UiDragCardLeave(e);
		newCardElem.ondrop = (e) => this.UiDropCard(e);
		newCardElem.ondragend = (e) => this.UiDragCardEnd(e);

		return newCardElem;
	}

	LoadCardList(cardlistData) {
		const cardlistElem = TaralloUtils.LoadTemplate("tmpl-cardlist", cardlistData);
		// events
		const nameChangedHandler = (elem) => this.UiCardListNameChanged(cardlistData["id"], elem, cardlistElem);
		TaralloUtils.SetEventBySelector(cardlistElem, ".cardlist-title h3", "onblur", nameChangedHandler);
		TaralloUtils.SetEventBySelector(cardlistElem, ".cardlist-title h3", "onkeydown", (elem, event) => TaralloUtils.BlurOnEnter(event));
		TaralloUtils.SetEventBySelector(cardlistElem, ".addcard-btn", "onclick", () => this.UiAddNewCard(cardlistData["id"], cardlistElem));
		TaralloUtils.SetEventBySelector(cardlistElem, ".editcard-submit-btn", "onclick", () => this.UiNewCard(cardlistData["id"], cardlistElem));
		TaralloUtils.SetEventBySelector(cardlistElem, ".editcard-card", "onkeydown", (elem, keydownEvent) => {
			if (keydownEvent.keyCode == 13) {
				keydownEvent.preventDefault();
				this.UiNewCard(cardlistData["id"], cardlistElem)
			}
		});
		TaralloUtils.SetEventBySelector(cardlistElem, ".editcard-cancel-btn", "onclick", () => this.UiCancelNewCard(cardlistElem));

		// drag and drop events
		const cardlistStartElem = cardlistElem.querySelector(".cardlist-start");
		cardlistStartElem.ondragover = (e) => e.preventDefault();
		cardlistStartElem.ondragenter = (e) => this.UiDragCardEnter(e);
		cardlistStartElem.ondragleave = (e) => this.UiDragCardLeave(e);
		cardlistStartElem.ondrop = (e) => this.UiDropCard(e);

		// events
		cardlistElem.ondragstart = (e) => this.UiDragCardListStart(e);
		cardlistElem.ondragenter = (e) => this.UiDragCardListEnter(e);
		cardlistElem.ondragover = (e) => e.preventDefault();
		cardlistElem.ondragleave = (e) => this.UiDragCardListLeave(e);
		cardlistElem.ondrop = (e) => this.UiDropCardList(e);
		cardlistElem.ondragend = (e) => this.UiDragCardListEnd(e);

		return cardlistElem;
	}

	// load the content of the current board page
	LoadBoardPage(contentObj) {
		TaralloUtils.ReplaceContentWithTemplate("tmpl-board", contentObj);
		document.title = contentObj["title"];
		const boardElem = document.getElementById("board");
		const newCardlistBtn = document.getElementById("add-cardlist-btn");

		if (contentObj["label_names"]) {
			this.labelNames = contentObj["label_names"].split(",");
			this.labelColors = contentObj["label_colors"].split(",");
		}
		this.allColorNames = contentObj["all_color_names"]; 

		// create card lists
		for (const cardlist of TaralloUtils.DBLinkedListIterator(contentObj["cardlists"], "id", "prev_list_id", "next_list_id")) {
			// create cardlist
			const newCardlistElem = this.LoadCardList(cardlist);
			boardElem.insertBefore(newCardlistElem, newCardlistBtn);

			// create owned cards
			const cardlistID = cardlist["id"];
			for (const cardData of TaralloUtils.DBLinkedListIterator(contentObj["cards"], "id", "prev_card_id", "next_card_id", card => card["cardlist_id"] === cardlistID)) {
				const newCardElem = this.LoadCard(cardData, newCardlistElem);
				// append the new card to the list
				newCardlistElem.appendChild(newCardElem);
			}
		}

		// project bar drag drop events
		const projectBar = document.getElementById("projectbar");
		projectBar.ondragover = (e) => e.preventDefault();
		projectBar.ondragenter = (e) => this.UiDragDeleteEnter(e);
		projectBar.ondragleave = (e) => this.UiDragDeleteLeave(e);
		projectBar.ondrop = (e) => this.UiDropDelete(e);
		// other events
		TaralloUtils.SetEventBySelector(projectBar, "#board-title", "onblur", (elem) => this.UiBoardTitleChanged(elem));
		TaralloUtils.SetEventBySelector(projectBar, "#board-title", "onkeydown", (elem, event) => TaralloUtils.BlurOnEnter(event));
		TaralloUtils.SetEventBySelector(projectBar, "#board-change-bg-btn", "onclick", () => this.UiChangeBackground(contentObj["id"]));
		TaralloUtils.SetEventBySelector(projectBar, "#board-share-btn", "onclick", () => this.UiShareBoard(contentObj["id"]));
		TaralloUtils.SetEventById("add-cardlist-btn", "onclick", () => this.UiAddCardList());
	}

	LoadClosedBoardPage(contentObj) {
		TaralloUtils.ReplaceContentWithTemplate("tmpl-closed-board", contentObj);
		document.title = "[Closed]" + contentObj["title"];
		//events
		TaralloUtils.SetEventById("closedboard-reopen-btn", "onclick", () => this.UiReopenBoard(contentObj["id"]));
		TaralloUtils.SetEventById("closedboard-delete-link", "onclick", () => this.UiShowBoardDeleteConfirmation(contentObj["id"]));
	}

	LoadUnaccessibleBoardPage(contentObj) {
		TaralloUtils.ReplaceContentWithTemplate("tmpl-unaccessible-board", contentObj);
		document.title = "Tarallo"
		if (contentObj["access_requested"]) {
			document.getElementById("unaccessibleboard-request-btn").classList.add("hidden");
			document.getElementById("unaccessibleboard-waiting-label").classList.remove("hidden");
		}

		//events
		TaralloUtils.SetEventById("unaccessibleboard-request-btn", "onclick", () => this.UiRequestBoardAccess());
	}

	OnBoardAccessUpdated(jsonResponseObj) {
		if (jsonResponseObj["access_requested"]) {
			document.getElementById("unaccessibleboard-request-btn").classList.add("hidden");
			document.getElementById("unaccessibleboard-waiting-label").classList.remove("hidden");
		}
	}

	UiRequestBoardAccess() {
		TaralloServer.Call("RequestBoardAccess", [], (response) => this.OnBoardAccessUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	LoadOpenCardAttachment(jsonAttachment, parentNode) {
		const attachmentElem = TaralloUtils.LoadTemplate("tmpl-opencard-attachment", jsonAttachment);
		const url = jsonAttachment["url"];
		const thumbUrl = jsonAttachment["thumbnail"];

		const attachmentLinkElem = attachmentElem.querySelector(".opencard-attachment-link");
		if (url !== undefined || thumbUrl !== undefined) {
			// loaded attachment
			attachmentLinkElem.setAttribute("href", url);
			attachmentElem.querySelector(".loader").remove();
			TaralloUtils.SetEventBySelector(attachmentElem, ".opencard-attachment-delete-btn", "onclick", () => this.UiDeleteAttachment(jsonAttachment["id"], attachmentElem));

			if (thumbUrl) {
				// prepare attachment with a preview
				attachmentLinkElem.querySelector(".ext").remove();
				attachmentLinkElem.querySelector("svg").remove();
				attachmentLinkElem.querySelector("img").setAttribute("src", thumbUrl);
			} else {
				// prepare attachment with icon and extension
				attachmentLinkElem.querySelector("img").remove();
			}

		} else {
			// loading or unavaialble attachment
			attachmentLinkElem.style.display = "none";
		}

		parentNode.appendChild(attachmentElem);
	}

	LoadLabelInOpenCard(openCardElem, cardID, labelIndex, active) {
		// retrieve needed elements of the open card
		const labelListElem = openCardElem.querySelector(".opencard-labellist");
		const labelSelectionDiag = openCardElem.querySelector("#opencard-label-select-diag");
		const addLabelBtnElem = openCardElem.querySelector(".opencard-add-label");
		const createLabelBtnElem = openCardElem.querySelector(".opencard-label-create-btn");

		// prepare label info
		const labelAdditionalParams = { "card-id": cardID, "index": labelIndex };
		const labelElemID = "#label-" + cardID + "-" + labelIndex;
		const openLabelElemID = labelElemID + "-open";

		// retrieve elements of the card tile in the board
		const cardElem = document.getElementById("card-" + cardID);
		const cardLabelListElem = cardElem.querySelector(".card-labellist");
		const cardLabelElem = cardElem.querySelector(labelElemID);

		if (active) {
			// remove label from the selectable ones
			const selectableLabelElem = labelSelectionDiag.querySelector(openLabelElemID);
			if (selectableLabelElem) {
				selectableLabelElem.remove();
			}

			// add it to the open card
			const openLabelElem = this.LoadLabel("tmpl-opencard-label", this.labelNames[labelIndex], this.labelColors[labelIndex], labelAdditionalParams);
			labelListElem.insertBefore(openLabelElem, addLabelBtnElem);
			openLabelElem.onclick = () => this.UiSetLabel(cardID, labelIndex, false);

			// add it to the card if missing
			if (!cardLabelElem) {
				const labelElem = this.LoadLabel("tmpl-card-label", this.labelNames[labelIndex], this.labelColors[labelIndex], labelAdditionalParams);
				cardLabelListElem.appendChild(labelElem);
			}
		} else {
			//remove label from the open card
			const openLabelElem = labelListElem.querySelector(openLabelElemID);
			if (openLabelElem) {
				openLabelElem.remove();
			}
			// remove label from the card tile in the board
			if (cardLabelElem) {
				cardLabelElem.remove();
			}

			// add it to the selectable ones
			const labelElem = this.LoadLabel("tmpl-selectable-label", this.labelNames[labelIndex], this.labelColors[labelIndex], labelAdditionalParams);
			labelSelectionDiag.insertBefore(labelElem, createLabelBtnElem);
			TaralloUtils.SetEventBySelector(labelElem, ".selectable-label", "onclick", () => this.UiSetLabel(cardID, labelIndex, true));
			TaralloUtils.SetEventBySelector(labelElem, ".selectable-label-edit-btn", "onclick", () => this.UiEditLabel(labelIndex));
		}
	}

	LoadOpenCard(jsonResponseObj) {
		// save to cache
		this.openCardCache[jsonResponseObj["id"]] = jsonResponseObj;

		// create card element
		const openCardData = Object.assign({}, jsonResponseObj);
		openCardData["content"] = ContentMarkupToHtml(jsonResponseObj["content"]); // decode content
		const openCardElem = TaralloUtils.LoadTemplate("tmpl-opencard", openCardData);

		// load labels
		let labelMask = jsonResponseObj["label_mask"];
		for (let i = 0; i < this.labelNames.length; i++, labelMask = labelMask >> 1) {
			if (this.labelNames[i].length === 0) {
				continue; // this label has been deleted
			}
			this.LoadLabelInOpenCard(openCardElem, jsonResponseObj["id"], i, labelMask & 0x01);
		}

		if (jsonResponseObj["attachmentList"] !== undefined) {
			// create attachments and add them to the card 
			const attachList = jsonResponseObj["attachmentList"];
			const attachlistElem = openCardElem.querySelector(".opencard-attachlist");
			for (let i = 0; i < attachList.length; i++) {
				this.LoadOpenCardAttachment(attachList[i], attachlistElem);
			}
		}

		// locked status
		if (jsonResponseObj["locked"]) {
			this.ToggleOpenCardLock(openCardElem);
		}

		// events
		TaralloUtils.SetEventBySelector(openCardElem, ".dialog-close-btn", "onclick", () => this.UiCloseDialog());
		TaralloUtils.SetEventBySelector(openCardElem, "#opencard-title", "onblur", (elem) => this.UiCardTitleChanged(elem, openCardData["id"]));
		TaralloUtils.SetEventBySelector(openCardElem, "#opencard-title", "onkeydown", (elem, event) => TaralloUtils.BlurOnEnter(event));
		TaralloUtils.SetEventBySelector(openCardElem, ".opencard-add-label", "onclick", () => this.UiOpenLabelSelectionDialog());
		TaralloUtils.SetEventBySelector(openCardElem, ".opencard-label-cancel-btn", "onclick", () => this.UiCloseLabelSelectionDialog());
		TaralloUtils.SetEventBySelector(openCardElem, ".opencard-label-create-btn", "onclick", () => this.UiCreateLabel());
		TaralloUtils.SetEventBySelector(openCardElem, ".opencard-content", "onfocus", (elem) => this.UiCardContentEditing(elem));
		TaralloUtils.SetEventBySelector(openCardElem, ".opencard-content", "onblur", (elem) => this.UiCardContentChanged(elem, openCardData["id"]));
		TaralloUtils.SetEventBySelector(openCardElem, ".add-attachment-btn", "onclick", () => this.UiAddAttachment(openCardData["id"]));
		TaralloUtils.SetEventBySelector(openCardElem, ".opencard-lock-btn", "onclick", (elem) => this.UiCardContentLock(elem, openCardElem));
		this.SetCardContentEventHandlers(openCardElem.querySelector(".opencard-content"));

		const contentElem = TaralloUtils.GetContentElement();
		contentElem.appendChild(openCardElem);
	}

	UiCloseDialog() {
		const openCardElem = document.getElementById("dialog-container");
		openCardElem.remove();
	}

	UiCancelNewCard(cardlistNode) {
		const editableCard = cardlistNode.querySelector(".editcard-ui[contentEditable]");
		editableCard.innerHTML = "";

		TaralloUtils.RemoveClassFromAll(cardlistNode, ".addcard-ui", "hidden");
		TaralloUtils.AddClassToAll(cardlistNode, ".editcard-ui", "hidden");
	}

	UiAddNewCard(cardlistID, cardlistNode) {
		// clear editing of other cards in other lists
		for (const cardlist of document.querySelectorAll(".cardlist")) {
			if (cardlist.id != "add-cardlist-btn") {
				this.UiCancelNewCard(cardlist);
			}
		}

		// enable editing of a new card
		TaralloUtils.AddClassToAll(cardlistNode, ".addcard-ui", "hidden");
		TaralloUtils.RemoveClassFromAll(cardlistNode, ".editcard-ui", "hidden");
		cardlistNode.querySelector(".editcard-ui[contentEditable]").focus();
	}

	UiNewCard(cardlistID, cardlistNode) {
		// prepare new card call args
		let args = [];
		args["title"] = cardlistNode.querySelector(".editcard-ui[contentEditable]").textContent;
		args["cardlist_id"] = cardlistID;

		// disable card editing
		this.UiCancelNewCard(cardlistNode);
	
		// submit new card to the server
		TaralloServer.Call("AddNewCard", args, (response) => this.OnCardAdded(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnCardAdded(jsonResponseObj) {
		// cread the card html node
		const newCardNode = this.LoadCard(jsonResponseObj);

		// add it to the cardlist node, after the prev card id
		const cardlistNode = document.getElementById("cardlist-" + jsonResponseObj["cardlist_id"]);
		let prevCardNode = null;
		if (jsonResponseObj["prev_card_id"] == 0) {
			prevCardNode = cardlistNode.querySelector(".cardlist-start");
		} else {
			prevCardNode = cardlistNode.querySelector("#card-" + jsonResponseObj["prev_card_id"]);
		}

		prevCardNode.insertAdjacentElement("afterend", newCardNode);
	}

	// load a page from the json response
	LoadPage(jsonResponseObj) {
		const pageContent = jsonResponseObj["page_content"];
		const pageName = jsonResponseObj["page_name"];
		switch (pageName) {
			case "Login":
				this.LoadLoginPage(pageContent);
				break;
			case "BoardList":
				this.LoadBoardListPage(pageContent);
				break;
			case "Board":
				this.LoadBoardPage(pageContent);
				break;
			case "ClosedBoard":
				this.LoadClosedBoardPage(pageContent);
				break;
			case "UnaccessibleBoard":
				this.LoadUnaccessibleBoardPage(pageContent);
				break;
		}

		// update background if required
		if (pageContent["background_url"] !== undefined) {
			this.SetBackground(pageContent["background_url"], pageContent["background_tiled"]);
		}

		// add needed events
		TaralloUtils.TrySetEventById("projectbar-logout-btn", "onclick", () => this.UiLogout());
	}

	
	UiDragCardStart(event) {
		this.draggedCard = event.currentTarget;
		document.getElementById("projectbar").classList.add("pb-mode-delete");
	}

	UiDragCardEnter(event) {
		if (this.draggedCard === null) {
			return; // not dragging a cardlist
		}

		event.currentTarget.classList.add("drag-target-card");
		event.preventDefault();
	}

	UiDragCardLeave(event) {
		// discard leave events if we are just leaving a child
		if (event.currentTarget.contains(event.relatedTarget)) {
			return;
		}

		if (this.draggedCard === null) {
			return; // not dragging a cardlist
		}

		event.currentTarget.classList.remove("drag-target-card");
		event.preventDefault();
	}

	OnCardMoved(jsonResponseObj) {
		this.draggedCard.remove(); // remove from the old position
		this.OnCardAdded(jsonResponseObj); // add back in the new position
		this.draggedCard = null;
	}

	UiDropCard(event) {
		event.currentTarget.classList.remove("drag-target-card");

		// check that a dragged card has been saved
		if (this.draggedCard === null) {
			return;
		}

		// fill call args
		let args = [];
		args["moved_card_id"] = this.draggedCard.getAttribute("dbid");
		if (event.currentTarget.matches(".card")) {
			args["new_prev_card_id"] = event.currentTarget.getAttribute("dbid");
		} else {
			args["new_prev_card_id"] = 0;
		}
		args["dest_cardlist_id"] = event.currentTarget.closest(".cardlist").getAttribute("dbid");

		// make the call if the card has actually moved
		if (args["moved_card_id"] != args["new_prev_card_id"]) {
			TaralloServer.Call("MoveCard", args, (response) => this.OnCardMoved(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
		} else {
			this.draggedCard = null;
		}
	}

	UiDragCardEnd(event) {
		document.getElementById("projectbar").classList.remove("pb-mode-delete");
	}

	OnCardDeleted(jsonResponseObj) {
		this.draggedCard.remove();
		this.draggedCard = null;
	}

	UiDropDelete(event) {
		event.currentTarget.classList.remove("drag-target-bar");

		if (this.draggedCard !== null) { // drag-delete card
			// fill call args
			let args = [];
			args["deleted_card_id"] = this.draggedCard.getAttribute("dbid");

			// make the call if the card has actually moved
			TaralloServer.Call("DeleteCard", args, (response) => this.OnCardDeleted(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
		} else if (this.draggedCardList !== null) {
			// trigger cardlist deletion
			const cardlistID = this.draggedCardList.getAttribute("dbid");
			this.UiDeleteCardList(cardlistID, this.draggedCardList);
			this.draggedCardList = null;
		}
	}

	UiDragDeleteEnter(event) {
		event.currentTarget.classList.add("drag-target-bar");
		event.preventDefault();
	}

	UiDragDeleteLeave(event) {
		// discard leave events if we are just leaving a child
		if (event.currentTarget.contains(event.relatedTarget)) {
			return;
		}

		event.currentTarget.classList.remove("drag-target-bar");
		event.preventDefault();
	}

	UiDragCardListStart(event) {
		if (!event.originalTarget.classList.contains("cardlist")) {
			return; // not dragging a cardlist
		}
		this.draggedCardList = event.currentTarget;
		document.getElementById("projectbar").classList.add("pb-mode-delete");
	}

	UiDragCardListEnter(event) {
		if (this.draggedCardList === null) {
			return; // not dragging a cardlist
		}

		event.currentTarget.classList.add("drag-target-cardlist");
		event.preventDefault();
	}

	UiDragCardListLeave(event) {
		// discard leave events if we are just leaving a child
		if (event.currentTarget.contains(event.relatedTarget)) {
			return;
		}

		if (this.draggedCardList === null) {
			return; // not dragging a cardlist
		}

		event.currentTarget.classList.remove("drag-target-cardlist");
		event.preventDefault();
	}

	OnCardListMoved(jsonResponseObj) {
		if (jsonResponseObj["prev_list_id"]) {
			// remove the cardlist from its current position and re-insert it using the previous one as reference
			this.draggedCardList.remove();
			const prevCardlistNode = document.getElementById("cardlist-" + jsonResponseObj["prev_list_id"]);
			prevCardlistNode.insertAdjacentElement("afterend", this.draggedCardList);
		} else {
			// re-insert as the first list in the board
			const cardlistContainerNode = this.draggedCardList.parentNode;
			this.draggedCardList.remove();
			cardlistContainerNode.prepend(this.draggedCardList);
		}

		this.draggedCardList = null;
	}

	UiDropCardList(event) {
		event.currentTarget.classList.remove("drag-target-cardlist");

		// check that a dragged cardlist has been saved
		if (this.draggedCardList === null) {
			return;
		}

		// validate movement
		const prevListElem = event.currentTarget;
		if (prevListElem === this.draggedCardList.previousSibling || prevListElem === this.draggedCardList) {
			// move to the same position, skip
			this.draggedCardList = null;
			return;
		}

		// fill args and update the server
		let args = [];
		args["moved_cardlist_id"] = this.draggedCardList.getAttribute("dbid");
		if (event.currentTarget.matches(".cardlist")) {
			args["new_prev_cardlist_id"] = prevListElem.getAttribute("dbid");
		} else {
			args["new_prev_cardlist_id"] = 0;
		}

		TaralloServer.Call("MoveCardList", args, (response) => this.OnCardListMoved(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiDragCardListEnd(event) {
		document.getElementById("projectbar").classList.remove("pb-mode-delete");
	}

	OnCardUpdated(jsonResponseObj) {
		const cardTileElement = document.getElementById("card-" + jsonResponseObj["id"]);
		cardTileElement.remove(); // remove old version
		this.OnCardAdded(jsonResponseObj); // add back the new version
	}

	UiCardTitleChanged(titleElement, cardID) {
		const newTitle = titleElement.textContent;

		if (this.openCardCache[cardID] !== undefined) {
			if (this.openCardCache[cardID]["title"] === newTitle) {			
				return; // skip server update if the title didn't actually change
			} else {			
				this.openCardCache[cardID]["title"] = newTitle; // update cache
			}
		}

		let args = [];
		args["id"] = titleElement.closest(".opencard").getAttribute("dbid");
		args["title"] = titleElement.textContent;
		TaralloServer.Call("UpdateCardTitle", args, (response) => this.OnCardUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	// search the content node for checkboxes, and copy the checked property to the checked attribute, 
	// to save their current state into the DOM.
	SaveCheckboxValuesToDOM(contentElem) {
		for (const checkboxElem of contentElem.querySelectorAll("input[type=checkbox]")) {
			if (checkboxElem.checked) {
				checkboxElem.setAttribute("checked", "checked");
			} else {
				checkboxElem.removeAttribute("checked");
			}
		}
	}

	SetCardContentEventHandlers(contentElem) {
		// checkboxes: their state is immediately committed to the server
		for (const checkboxElem of contentElem.querySelectorAll("input[type=checkbox]")) {
			checkboxElem.onchange = () => this.UiCardCheckboxChanged(checkboxElem, contentElem);
		}

		// copy to clipboard buttons
		for (const copyBtnElem of contentElem.querySelectorAll(".copy-btn")) {
			copyBtnElem.onmousedown = (event) => {
				this.UiCardContentToClipboard(copyBtnElem.parentElement);
				event.preventDefault();
			}
		}
	}

	UiCardContentEditing(contentElement) {
		// save checkbox values so they can be converted to markup
		this.SaveCheckboxValuesToDOM(contentElement); 
		// change content to an editable version of the markup language while editing
		const editableMarkup = ContentHtmlToMarkupEditing(contentElement.innerHTML);
		contentElement.innerHTML = editableMarkup;
		window.getSelection().removeAllRanges();
	}

	UiCardContentChanged(contentElement, cardID) {
		// re-convert possible html markup generate by content editing (and <br> added for easier markup editing) 
		const contentMarkup = ContentHtmlToMarkup(contentElement.innerHTML);

		// update content area html
		contentElement.innerHTML = ContentMarkupToHtml(contentMarkup);
		this.SetCardContentEventHandlers(contentElement);
		window.getSelection().removeAllRanges();

		if (this.openCardCache[cardID] !== undefined) {
			if (this.openCardCache[cardID]["content"] === contentMarkup) {
				return; // skip server update if the content didn't actually change
			} else {
				this.openCardCache[cardID]["content"] = contentMarkup; // update cache
			}
		}

		// post the update to the server
		let args = [];
		args["id"] = contentElement.closest(".opencard").getAttribute("dbid");
		args["content"] = contentMarkup;
		TaralloServer.Call("UpdateCardContent", args, (response) => this.OnCardUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiCardCheckboxChanged(checkboxElem, contentElement) {
		// save checkbox values so they can be converted to markup
		this.SaveCheckboxValuesToDOM(contentElement); 
		// convert card html content to markup
		const contentMarkup = ContentHtmlToMarkup(contentElement.innerHTML);
		// post the update to the server
		let args = [];
		args["id"] = contentElement.closest(".opencard").getAttribute("dbid");
		args["content"] = contentMarkup;
		TaralloServer.Call("UpdateCardContent", args, (response) => this.OnCardUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiCardContentToClipboard(contentElem) {
		// save the content of the specified div to clipboard
		const contentMarkup = ContentHtmlToMarkup(contentElem.innerHTML);
		const textContent = DecodeHTMLEntities(contentMarkup);
		navigator.clipboard.writeText(textContent);
		this.ShowInfoPopup("Copied!", "page-error");
	}

	UiCardContentLock(btnElem, opencardElem) {
		this.ToggleOpenCardLock(opencardElem);

		// update locked status on the server
		let args = [];
		args["id"] = btnElem.closest(".opencard").getAttribute("dbid");
		args["locked"] = btnElem.classList.contains("locked");
		TaralloServer.Call("UpdateCardFlags", args, (response) => this.OnCardUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	ToggleOpenCardLock(opencardElem) {
		const contentElem = opencardElem.querySelector(".opencard-content");
		const btnElem = opencardElem.querySelector(".opencard-lock-btn");

		if (btnElem.classList.contains("locked")) {
			// unlock the card content
			btnElem.querySelector("use").setAttribute("href", "#icon-unlocked");
			btnElem.classList.remove("locked");
			contentElem.setAttribute("contenteditable", "true");
		} else {
			// lock the card content
			btnElem.querySelector("use").setAttribute("href", "#icon-locked");
			btnElem.classList.add("locked");
			contentElem.setAttribute("contenteditable", "false");
		}
	}

	RemoveUiAttachmentPlaceholder() {
		const attachlistElem = document.querySelector(".opencard-attachlist");
		if (attachlistElem) {
			attachlistElem.querySelector(".loader").parentElement.remove();
		}
	}

	OnAttachmentAdded(jsonResponseObj) {
		this.RemoveUiAttachmentPlaceholder();
		const attachlistElem = document.querySelector(".opencard-attachlist");
		this.LoadOpenCardAttachment(jsonResponseObj, attachlistElem);
		this.OnCardUpdated(jsonResponseObj["card"]);
	}

	async OnAttachmentSelected(file, cardID) {
		// upload it to the server
		let args = [];
		args["card_id"] = cardID;
		args["filename"] = file.name;
		args["attachment"] = await TaralloUtils.FileToBase64(file);
		TaralloServer.Call("UploadAttachment", args, (response) => this.OnAttachmentAdded(response), (msg) => {
			this.RemoveUiAttachmentPlaceholder();
			this.ShowErrorPopup(msg, "page-error");
		});
		const attachlistElem = document.querySelector(".opencard-attachlist");
		this.LoadOpenCardAttachment({"id":0, "name":"uploading..." } , attachlistElem); // empty loading attachment
	}

	UiAddAttachment(cardID) {
		TaralloUtils.SelectFileDialog("image/*", true, (files) => {
			for (const file of files) {
				this.OnAttachmentSelected(file, cardID);
			}
		});
	}

	OnAttachmentDeleted(jsonResponseObj) {
		const attachmentElem = document.getElementById("attachment-" + jsonResponseObj["id"]);
		if (attachmentElem) {
			attachmentElem.remove();
		}
		this.OnCardUpdated(jsonResponseObj["card"]);
	}

	UiDeleteAttachment(attachmentID, attachmentNode) {
		let args = [];
		args["id"] = attachmentID;
		TaralloServer.Call("DeleteAttachment", args, (response) => this.OnAttachmentDeleted(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnCardListUpdated(jsonResponseObj) {
		const cardListElem = document.getElementById("cardlist-" + jsonResponseObj["id"]);
		cardListElem.querySelector("h3").textContent = jsonResponseObj["name"];
	}

	UiCardListNameChanged(cardlistID, nameElem, cardlistElem) {
		if (cardlistElem.classList.contains("waiting-deletion")) {
			return; // avoid being triggered while deleting a cardlist (can happen on mobile)
		}
	
		let args = [];
		args["id"] = cardlistID;
		args["name"] = nameElem.textContent;
		TaralloServer.Call("UpdateCardListName", args, (response) => this.OnCardListUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnCardListAdded(jsonResponseObj) {
		// create cardlist
		const boardElem = document.getElementById("board");
		const newCardlistBtn = document.getElementById("add-cardlist-btn");
		const newCardlistElem = this.LoadCardList(jsonResponseObj);
		boardElem.insertBefore(newCardlistElem, newCardlistBtn);
		// start name editing automatically
		const listTitleElem = newCardlistElem.querySelector("h3");
		listTitleElem.focus();
		window.getSelection().selectAllChildren(listTitleElem);
	}

	UiAddCardList() {
		let args = [];
		args["name"] = "New List";
		args["prev_list_id"] = 0;
		const prevListElem = document.getElementById("add-cardlist-btn").previousElementSibling;
		if (prevListElem !== null) {
			args["prev_list_id"] = prevListElem.getAttribute("dbid");
		}
		TaralloServer.Call("AddCardList", args, (response) => this.OnCardListAdded(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnCardListDeleted(jsonResponseObj) {
		const cardlistElem = document.getElementById("cardlist-" + jsonResponseObj["id"]);
		if (cardlistElem) {
			cardlistElem.remove();
		}
	}

	UiDeleteCardList(cardlistID, cardlistElem) {
		if (cardlistElem.classList.contains("waiting-deletion")) {
			return; // avoid being triggered again while deleting (can happen on mobile)
		}

		let args = [];
		args["id"] = cardlistID;
		cardlistElem.classList.add("waiting-deletion");
		const onErrorCallback = (msg) => {
			cardlistElem.classList.remove("waiting-deletion");
			this.ShowErrorPopup(msg, "page-error");
		};
		TaralloServer.Call("DeleteCardList", args, (response) => this.OnCardListDeleted(response), onErrorCallback);
	}

	OnBoardTitleUpdated(jsonResponseObj) {
		const boardTitleElem = document.getElementById("projectbar-left").querySelector("h2");
		boardTitleElem.textContent = jsonResponseObj["title"];
	}

	UiBoardTitleChanged(titleNode) {
		let args = [];
		args["title"] = titleNode.textContent;
		TaralloServer.Call("UpdateBoardTitle", args, (response) => this.OnBoardTitleUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnBoardCreated(jsonResponseObj) {
		if (Number.isInteger(jsonResponseObj["id"])) {
			// redirect to the newly created board
			window.location.href = new URL("?board_id=" + jsonResponseObj["id"], window.location.href).href;
		}
	}

	UiCreateNewBoard() {
		let args = [];
		args["title"] = "My new board";
		TaralloServer.Call("CreateNewBoard", args, (response) => this.OnBoardCreated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnBoardClosed(jsonResponseObj) {
		const boardTileElem = document.getElementById("board-tile-" + jsonResponseObj["id"]);
		boardTileElem.remove();
		this.LoadBoardTile(jsonResponseObj);
	}

	UiCloseBoard(boardID, boardTileElem) {
		let args = [];
		args["id"] = boardID;
		TaralloServer.Call("CloseBoard", args, (response) => this.OnBoardClosed(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnBoardReopened(jsonResponseObj) {
		this.ReloadContent();
	}

	UiReopenBoard(boardID) {
		let args = [];
		args["id"] = boardID;
		TaralloServer.Call("ReopenBoard", args, (response) => this.OnBoardReopened(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnBackgroundChanged(jsonResponseObj) {
		this.SetBackground(jsonResponseObj["background_url"], jsonResponseObj["background_tiled"]);
	}

	async OnBackgroundSelected(file, boardID) {
		// upload the new background image to the server
		let args = [];
		args["filename"] = file.name;
		args["background"] = await TaralloUtils.FileToBase64(file);
		TaralloServer.Call("UploadBackground", args, (response) => this.OnBackgroundChanged(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiChangeBackground(boardID) {
		TaralloUtils.SelectFileDialog("image/*", false, (file) => this.OnBackgroundSelected(file, boardID));
	}

	LoadShareDialog(jsonResponseObj) {
		// initialize the share dialog
		const shareDialogElem = TaralloUtils.LoadTemplate("tmpl-share-dialog", jsonResponseObj);
		TaralloUtils.SetEventBySelector(shareDialogElem, ".dialog-close-btn", "onclick", () => this.UiCloseDialog());
		const permissionListElem = shareDialogElem.querySelector("#share-dialog-list");
		const dialogButtons = permissionListElem.querySelector(".share-dialog-entry");

		// add all permission rows
		for (const permission of jsonResponseObj["permissions"]) {
			const permissionElem = TaralloUtils.LoadTemplate("tmpl-share-dialog-entry", permission);

			const permissionSelectElem = permissionElem.querySelector(".permission");
			permissionSelectElem.onchange = () => this.UiUserPermissionChanged(permissionSelectElem, permission["user_id"]);
			const selectedOptionElem = permissionSelectElem.querySelector(`option[value='${permission["user_type"]}']`);
			selectedOptionElem.setAttribute("selected", "true");

			permissionListElem.insertBefore(permissionElem, dialogButtons);
		}

		// add the dialog to the content
		const contentElem = TaralloUtils.GetContentElement();
		contentElem.appendChild(shareDialogElem);
	}

	UiShareBoard(boardID) {
		let args = [];
		args["id"] = boardID;
		TaralloServer.Call("GetBoardPermissions", args, (response) => this.LoadShareDialog(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	SetUiPermission(selectElem, userType) {
		for (let i = 0; i < selectElem.options.length; i++) {
			if (selectElem.options[i].value == userType) {
				selectElem.selectedIndex = i;
				break;
			}
		}
	}

	OnUserPermissionUpdated(jsonResponseObj) {
		// check if the share dialog is still open
		const shareDialog = document.getElementById("share-dialog");
		if (!shareDialog) {
			return;
		}

		// search for the permission selection box and update it
		const selectElem = shareDialog.querySelector(`select[dbuser="${jsonResponseObj["user_id"]}"]`);
		this.SetUiPermission(selectElem, jsonResponseObj["user_type"]);
		selectElem.setAttribute("dbvalue", jsonResponseObj["user_type"]); // update cached db value
		this.ShowInfoPopup("Permissions updated.", "share-dialog-popup");
	}

	UiUserPermissionChanged(selectElem, userID) {
		const curUserType = selectElem.getAttribute("dbvalue");
		const requestedUserType = selectElem.value;

		// revert the change (wait confirmation from the server)
		this.SetUiPermission(selectElem, curUserType);
		
		// request permission change to the server
		let args = [];
		args["user_id"] = userID;
		args["user_type"] = requestedUserType;
		TaralloServer.Call("SetUserPermission", args, (response) => this.OnUserPermissionUpdated(response), (msg) => this.ShowErrorPopup(msg, "share-dialog-popup"));
	}

	OnBoardDeleted() {
		// redirect to the home page
		window.location.href = new URL("?", window.location.href).href;
	}

	UiDeleteBoard(boardID) {
		let args = [];
		args["id"] = boardID;
		TaralloServer.Call("DeleteBoard", args, (response) => this.OnBoardDeleted(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiShowBoardDeleteConfirmation(boardID) {
		const msgElem = document.getElementById("closedboard-delete-label");
		const linkElem = document.getElementById("closedboard-delete-link");
		msgElem.classList.remove("hidden");
		linkElem.textContent = "Yes, delete everything!";
		linkElem.onclick = () => this.UiDeleteBoard(boardID);
	}

	async OnTrelloExportSelected(jsonFile) {
		// upload the new trello export to the server
		let args = [];
		args["trello_export"] = await TaralloUtils.JsonFileToObj(jsonFile);
		TaralloServer.Call("ImportFromTrello", args, (response) => this.OnBoardCreated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiImportFromTrello() {
		TaralloUtils.SelectFileDialog("application/json", false, (jsonFile) => OnTrelloExportSelected(jsonFile));
	}

	UiOpenLabelSelectionDialog() {
		const labelSelectDialog = document.getElementById("opencard-label-select-diag");
		if (labelSelectDialog.classList.contains("hidden")) {
			labelSelectDialog.classList.remove("hidden"); // display the dialog
			const labelEditDialog = document.getElementById("opencard-label-edit-diag");
			if (labelEditDialog) {
				labelEditDialog.remove(); // delete the label edit dialog if open
			}
		} else {
			labelSelectDialog.classList.add("hidden"); // hide the dialog
		}
	}

	OnBoardLabelsChanged(jsonResponseObj) {
		this.labelNames = jsonResponseObj["label_names"].split(",");
		this.labelColors = jsonResponseObj["label_colors"].split(",");

		// update open card if still open
		const openCardElem = document.querySelector(".opencard");
		if (openCardElem) {
			const cardID = openCardElem.getAttribute("dbid");
			this.LoadLabelInOpenCard(openCardElem, cardID, jsonResponseObj["index"], false);
		}
	}

	UiCreateLabel() {
		TaralloServer.Call("CreateBoardLabel", [], (response) => this.OnBoardLabelsChanged(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiCloseLabelSelectionDialog() {
		// hide the dialog
		document.getElementById("opencard-label-select-diag").classList.add("hidden");
	}

	OnOpenCardLabelChanged(jsonResponseObj) {
		const openCardElem = document.getElementById("opencard-" + jsonResponseObj["card_id"]);
		this.LoadLabelInOpenCard(openCardElem, jsonResponseObj["card_id"], jsonResponseObj["index"], jsonResponseObj["active"]);
	}

	UiSetLabel(cardID, index, active) {
		let args = [];
		args["card_id"] = cardID;
		args["index"] = index;
		args["active"] = active;
		TaralloServer.Call("SetCardLabel", args, (response) => this.OnOpenCardLabelChanged(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	LoadEditLabelDialog(labelIndex) {
		// create the label edit dialog for the specific label
		const labelEditArgs = [];
		labelEditArgs["index"] = labelIndex;
		labelEditArgs["name"] = this.labelNames[labelIndex];
		labelEditArgs["color"] = this.labelColors[labelIndex];
		const labelEditDialogElem = TaralloUtils.LoadTemplate("tmpl-opencard-label-edit-diag", labelEditArgs);
		const labelEditColorListElem = labelEditDialogElem.querySelector("#opencard-label-edit-color-list");

		// load all color selection tiles
		const labelPreviewElem = labelEditDialogElem.querySelector(".label");
		for (const color of this.allColorNames) {
			const colorTileElem = TaralloUtils.LoadTemplate("tmpl-opencard-label-edit-color-tile", { "color": color });
			labelEditColorListElem.appendChild(colorTileElem);
			colorTileElem.onclick = () => this.UiEditLabelColor(color, labelPreviewElem);
		}
		
		// events
		TaralloUtils.SetEventBySelector(labelEditDialogElem, "#opencard-label-edit-cancel-btn", "onclick", () => this.UiCancelEditLabel(labelEditDialogElem));
		TaralloUtils.SetEventBySelector(labelEditDialogElem, "#opencard-label-edit-name", "oninput", (elem, event) => this.UiEditLabelName(event.target.value, labelPreviewElem));
		TaralloUtils.SetEventBySelector(labelEditDialogElem, "#opencard-label-edit-save-btn", "onclick", () => this.UiEditLabelSave(labelIndex, labelPreviewElem.innerText, labelPreviewElem.getAttribute("color")));
		TaralloUtils.SetEventBySelector(labelEditDialogElem, "#opencard-label-edit-delete-btn", "onclick", (elem) => this.UiDeleteLabel(labelIndex, elem));
		return labelEditDialogElem;
	}

	UiEditLabel(labelIndex) {
		// hide the label selection dialog
		const labelSelectDialogElem = document.getElementById("opencard-label-select-diag");
		labelSelectDialogElem.classList.add("hidden"); 

		// create and display the edit dialog
		const labelEditDialogElem = this.LoadEditLabelDialog(labelIndex);
		labelSelectDialogElem.insertAdjacentElement("afterend", labelEditDialogElem);
	}

	UiCancelEditLabel(labelEditDialogElem) {
		// remove the label edit dialog and show (go back to) the selection
		const labelSelectDialogElem = document.getElementById("opencard-label-select-diag");
		labelSelectDialogElem.classList.remove("hidden"); 
		labelEditDialogElem.remove();
	}

	UiEditLabelName(newNameStr, labelPreviewElem) {
		labelPreviewElem.textContent = newNameStr;
	}

	UiEditLabelColor(color, labelPreviewElem) {
		// remove previous color
		for (const color of this.allColorNames) {
			labelPreviewElem.classList.remove(color);
		}
		// add the new color
		labelPreviewElem.classList.add(color);
		labelPreviewElem.setAttribute("color", color);
	}

	OnLabelUpdated(jsonResponseObj) {
		const labelIndex = jsonResponseObj["index"];

		// update local label values
		this.labelNames[labelIndex] = jsonResponseObj["name"];
		this.labelColors[labelIndex] = jsonResponseObj["color"];

		// go back to the label selection
		const labelEditDialogElem = document.getElementById("opencard-label-edit-diag");
		this.UiCancelEditLabel(labelEditDialogElem);
		
		// update all occurrences of the label
		const labelElemList = document.querySelectorAll(`.label-${labelIndex}`);
		for (const labelElem of labelElemList) {
			this.UiEditLabelColor(jsonResponseObj["color"], labelElem);
			this.UiEditLabelName(jsonResponseObj["name"], labelElem);
		}
	}

	UiEditLabelSave(labelIndex, labelName, labelColor) {
		let args = [];
		args["index"] = labelIndex;
		args["name"] = labelName;
		args["color"] = labelColor;
		TaralloServer.Call("UpdateBoardLabel", args, (response) => this.OnLabelUpdated(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	OnLabelDeleted(jsonResponseObj) {
		const labelIndex = jsonResponseObj["index"];

		// remove local label values
		this.labelNames[labelIndex] = "";
		this.labelColors[labelIndex] = "";

		// go back to the label selection
		const labelEditDialogElem = document.getElementById("opencard-label-edit-diag");
		this.UiCancelEditLabel(labelEditDialogElem);

		// remove the corresponding selectable label
		const selectableLabelElem = document.querySelector(`.selectable-label.label-${labelIndex}`);
		selectableLabelElem.parentElement.remove();
		// remove all occurrences of the label in cards
		const labelElemList = document.querySelectorAll(`.label-${labelIndex}`);
		for (const labelElem of labelElemList) {
			labelElem.remove();
		}
	}

	UiDeleteLabel(labelIndex, buttonElem) {
		const confirmed = buttonElem.getAttribute("confirmed");
		if (confirmed == 0) { // first confirmation
			buttonElem.textContent = "This label will be removed from all cards, are you sure?";
			buttonElem.setAttribute("confirmed", 1);
			return;
		}
		if (confirmed == 1) { // second confirmation
			buttonElem.textContent = "Are you really sure? there is no undo!";
			buttonElem.setAttribute("confirmed", 2);
			return;
		}

		// ask server to delete the label
		let args = [];
		args["index"] = labelIndex;
		TaralloServer.Call("DeleteBoardLabel", args, (response) => this.OnLabelDeleted(response), (msg) => this.ShowErrorPopup(msg, "page-error"));
	}

	UiPaste(pasteEvent) {
		const openCardElem = document.querySelector(".opencard"); // search for a destination card
		const tag = pasteEvent.target.nodeName;
		const clipboardItems = (pasteEvent.clipboardData || pasteEvent.originalEvent.clipboardData).items; // retrieve clipboard items

		if (clipboardItems.length < 1) {
			return; // nothing to be pasted
		}

		// for each item in the clipboard
		for (let i = 0; i < clipboardItems.length; i++) {
			const item = clipboardItems[i];

			if (item.kind === 'file' && openCardElem) {
				// pasting a file into an open card: upload as attachment
				const cardID = openCardElem.getAttribute("dbid");
				const clipboardFile = item.getAsFile();
				this.OnAttachmentSelected(clipboardFile, cardID);
				pasteEvent.preventDefault();
			} else if (item.type == "text/plain" && window.getSelection().rangeCount && tag != "INPUT" ) {
				// pasting text into an editable field: insert as text
				item.getAsString((pastedText) => {
					const selection = window.getSelection();
					if (selection.rangeCount) {
						selection.deleteFromDocument();
						const curSelection = selection.getRangeAt(0);
						curSelection.insertNode(document.createTextNode(pastedText));
						curSelection.setStart(curSelection.endContainer, curSelection.endOffset);
					}
				});
				pasteEvent.preventDefault();
			}

		}
	}

	ShowErrorPopup(errorMsg, popupID) {
		this.ShowPopup(errorMsg, popupID, "#d44");
	}

	ShowInfoPopup(infoMessage, popupID) {
		this.ShowPopup(infoMessage, popupID, "#2aa");
	}

	ShowPopup(msg, popupID, color) {
		if (typeof popupID !== 'undefined') {
			// fill the error displaying element
			const popupElem = document.getElementById(popupID);
			popupElem.innerHTML = msg;
			popupElem.style.backgroundColor = color;

			// reflow popup animation
			popupElem.style.animation = 'none';
			popupElem.offsetHeight; /* trigger reflow */
			popupElem.style.animation = null; 
			popupElem.classList.add("popup-animate");
		}
	}
}

let tarallo = new TaralloClient();
tarallo.Startup();