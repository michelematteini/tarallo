
class TaralloUtils {
	static ReplaceHtmlTemplateArgs(templateHtml, args) {
		// replace args
		let html = templateHtml;
		for (const argName in args) {
			if (Object.hasOwn(args, argName)) {
				html = html.replaceAll("$" + argName, args[argName]);
			}
		}

		return html;
	}

	static GetContentElement() {
		return document.getElementById("content");
	}

	// replace the page content (#content div inner html) with the content of the specified template tag id
	static ReplaceContentWithTemplate(templateName, args) {
		const template = document.getElementById(templateName);
		const contentDiv = TaralloUtils.GetContentElement();
		contentDiv.innerHTML = TaralloUtils.ReplaceHtmlTemplateArgs(template.innerHTML, args);
	}

	// returns a page element createad from the tag templage with the specified id
	// replacing all $args with the <args>  replacements array
	static LoadTemplate(templateName, args) {
		// replace args
		const templateHtml = document.getElementById(templateName).innerHTML;
		const html = TaralloUtils.ReplaceHtmlTemplateArgs(templateHtml, args);

		// convert back to an element
		const template = document.createElement('template');
		template.innerHTML = html;
		const result = template.content.children;
		if (result.length === 1)
			return result[0];
		return result;
	}

	static GetQueryStringParams() {
		const queryString = window.location.search;
		return new URLSearchParams(queryString);
	}

	static* DBLinkedListIterator(resultsArray, indexFiledName, prevIndexFieldName, nextIndexFieldName, whereCondition = (result) => true) {

		// indexing of the linked list
		let curID = 0;
		const indexedResults = new Map();
		for (const item of resultsArray) {
			if (!whereCondition(item)) {
				continue;
			}

			if (item[prevIndexFieldName] === 0) {
				curID = item[indexFiledName]; // save first item id in the linked list
			}
			indexedResults.set(item[indexFiledName], item);
		}

		// iterate over the sorted cardlists
		let maxCount = indexedResults.size;
		let curCount = 0;
		while (curID !== 0)	{
			if (curCount >= maxCount) {
				console.error("Invalid DB iterator (loop detected at ID = %d).", curID);
				break;
			}

			const curItem = indexedResults.get(curID);

			if (curItem === undefined) {
				console.error("Invalid DB iterator (invalid pointer detected with ID = %d).", curID);
				break;
			}

			yield curItem;

			curID = curItem[nextIndexFieldName];
			curCount++;
		}

	}


	static AddClassToAll(parentNode, cssSelector, className) {
		const nodes = parentNode.querySelectorAll(cssSelector);
		for (let i = 0; i < nodes.length; i++) {
			nodes[i].classList.add(className);
		}
	}

	static RemoveClassFromAll(parentNode, cssSelector, className) {
		const nodes = parentNode.querySelectorAll(cssSelector);
		for (let i = 0; i < nodes.length; i++) {
			nodes[i].classList.remove(className);
		}
	}

	/**
	* Select file(s).
	* @param {String} contentType The content type of files you wish to select. For instance, use "image/*" to select all types of images (other examples : "image/png", or "video/*, .pdf, .zip").
	* @param {Function<File>} callback A static called if a file is selected.
	*/
	static SelectFileDialog(contentType, onSelected) {
		return new Promise(resolve => {
			let input = document.createElement('input');
			input.type = 'file';
			input.multiple = false;
			input.accept = contentType;

			input.onchange = () => {
				let files = Array.from(input.files);
				onSelected(files[0]);
			};

			input.click();
		});
	}

	static FileToBase64(file) {
		return new Promise(resolve => {
			// read the file content as a base64 string
			const reader = new FileReader();
			reader.onload = readerEvent => {
				const base64String = readerEvent.target.result;
				const base64Start = base64String.indexOf("base64,") + 7;
				resolve(base64String.substring(base64Start));
			}
			reader.readAsDataURL(file);
		});
	}

	static JsonFileToObj(file) {
		return new Promise(resolve => {
			// read the file content as a base64 string
			const reader = new FileReader();
			reader.onload = readerEvent => {
				const jsonString = readerEvent.target.result;
				const jsonObj = JSON.parse(jsonString);
				resolve(jsonObj);
			}
			reader.readAsText(file);
		});
	}

	static IsMobileDevice() {
		return /Mobi/i.test(window.navigator.userAgent);
	}

	static TrySetEventById(elemId, eventName, handler) {
		const elem = document.getElementById(elemId);
		if (elem) {
			elem[eventName] = (event) => handler(elem, event);
		}
	}

	static SetEventById(elemId, eventName, handler) {
		const elem = document.getElementById(elemId);
		elem[eventName] = (event) => handler(elem, event);
	}

	static SetEventBySelector(parentElem, selector, eventName, handler) {
		const elem = parentElem.querySelector(selector);
		elem[eventName] = (event) => handler(elem, event);
	}

	static BlurOnEnter(keydownEvent) {
		if (keydownEvent.keyCode == 13) {
			keydownEvent.preventDefault();
			keydownEvent.currentTarget.blur();
		}
	}
}