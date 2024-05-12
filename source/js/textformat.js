const MARKUP_TITLE = "# ";
const MARKUP_SUBTITLE = "## ";
const MARKUP_CHK_CHECKED = "[x] ";
const MARKUP_CHK_UNCHECKED = "[ ] ";
const MARKUP_CODE_MULTILINE = "```";
const MARKUP_LI = "- ";
const MARKUP_LINEBREAK = "\n";

// converts the db markup language to displayable html
function ContentMarkupToHtml(markup) {
    let html = "";
    let markupLines = markup.split(MARKUP_LINEBREAK);
    let tagStack = [];

    // foreach markup line
    for (let i = 0; i < markupLines.length; i++) {

        // === convert inline tokens
        let markupLine = markupLines[i];
        markupLine = markupLine.replaceAll(/\*\*(.*?)\*\*/g, "<b>$1</b>"); // bold
        markupLine = markupLine.replaceAll(/`([^`]+?)`/g, "<span class=\"monospace\">$1</span>"); // monospace
        const mouseDownJS = "window.open(\"$1\", \"_blank\"); event.preventDefault();";
        markupLine = markupLine.replaceAll(/(https?:\/\/.*?)(\s|$)/g, "<a onmousedown='" + mouseDownJS + "' href='' contentEditable='false'>$1</a>$2"); // links

        // === convert line start tokens
        let lineHtml = "";

        if (markupLine.startsWith(MARKUP_TITLE)) {
            // title
            lineHtml = "<h2>" + markupLine.substring(MARKUP_TITLE.length) + "</h2>";
        } else if (markupLine.startsWith(MARKUP_SUBTITLE)) {
            // subtitle
            lineHtml = "<h3>" + markupLine.substring(MARKUP_SUBTITLE.length) + "</h3>";
        } else if (markupLine.startsWith(MARKUP_LI + MARKUP_CHK_UNCHECKED)) {
            // unchecked checkbox
            if (tagStack[tagStack.length - 1] !== "</ul>") {
                lineHtml += "<ul>";
                tagStack.push("</ul>");
            }
            lineHtml += "<li style=\"list-style-type: none\">";
            lineHtml += "<span contenteditable=false><input type=\"checkbox\"></span>";
            lineHtml += markupLine.substring(MARKUP_LI.length + MARKUP_CHK_UNCHECKED.length);
            lineHtml += "</li>";
        } else if (markupLine.startsWith(MARKUP_LI + MARKUP_CHK_CHECKED)) {
            // checked checkbox
            if (tagStack[tagStack.length - 1] !== "</ul>") {
                lineHtml += "<ul>";
                tagStack.push("</ul>");
            }
            lineHtml += "<li style=\"list-style-type: none\">";
            lineHtml += "<span contenteditable=false><input type=\"checkbox\" checked=\"checked\"></span>";
            lineHtml += markupLine.substring(MARKUP_LI.length + MARKUP_CHK_CHECKED.length);
            lineHtml += "</li>";
        } else if (markupLine.startsWith(MARKUP_LI)) {
            // list item
            if (tagStack[tagStack.length - 1] !== "</ul>" && tagStack[tagStack.length - 1] !== "</ol>") {
                lineHtml += "<ul>";
                tagStack.push("</ul>");
            }
            lineHtml += "<li>";
            lineHtml += markupLine.substring(MARKUP_LI.length);
            lineHtml += "</li>";
        } else if (/^\d+?\.\s/.test(markupLine)) {
            // ordered list item
            let classes = "ordered ";
            if (tagStack[tagStack.length - 1] !== "</ul>" && tagStack[tagStack.length - 1] !== "</ol>") {
                lineHtml += "<ol>";
                tagStack.push("</ol>");
                classes += "first";
            }
            lineHtml += "<li class='" + classes + "'>";
            lineHtml += markupLine.substring(markupLine.indexOf(".") + 2);
            lineHtml += "</li>";
        } else if (markupLine.startsWith(MARKUP_CODE_MULTILINE)) {
            if (tagStack[tagStack.length - 1] !== "</div>") {
                // start of multiline code block
                lineHtml += "<div class=\"monospace\">";
                tagStack.push("</div>");
            } else {
                // end of multiline code block
                lineHtml += tagStack.pop();
            }
            lineHtml += markupLine.substring(MARKUP_CODE_MULTILINE.length);
        } else if (markupLine.trim().length == 0) {
            // empty line
            if (tagStack.length > 0 && tagStack[tagStack.length - 1] !== "</div>") {
                lineHtml += tagStack.pop();
            }
            lineHtml += "<br>";
        } else {
            // simple text
            lineHtml = "<p>" + markupLine + "</p>";
        }

        html += lineHtml;
    }

    // close all remaining tags
    while (tagStack.length > 0) {
        html += tagStack.pop();
    }

    return html;
}

// converts a DOM node to the db markup language
function HtmlNodeToMarkup(htmlNode) {
    let curChildNodes = Array.from(htmlNode.childNodes);
    let processedNodesCount = curChildNodes.length;

    // early out if there are no children to process
    if (processedNodesCount == 0) {
        return 0;
    }

    let olIndex = 1;
    for (const childNode of curChildNodes) {

        if (childNode.nodeName == "#text") {
            // skip text nodes
            processedNodesCount--;
            continue;
        }

        // discard tags by default
        let outerHTML = childNode.innerHTML;

        // perform custom behaviours for specific tags
        switch (childNode.nodeName) {
            case "DIV":
                if (childNode.classList.contains("monospace")) {
                    outerHTML = MARKUP_CODE_MULTILINE + MARKUP_LINEBREAK + outerHTML + MARKUP_CODE_MULTILINE;
                }
                // add a new line, unless the div is empty, or terminate with a line break
                const childNodeCount = childNode.childNodes.length;
                if (childNodeCount > 0 && childNode.childNodes[childNodeCount - 1].nodeName !== "BR") {
                    outerHTML += MARKUP_LINEBREAK;
                }
                break;
            case "P":
                outerHTML += MARKUP_LINEBREAK;
                break;
            case "BR":
                outerHTML = MARKUP_LINEBREAK;
                break;
            case "H2":
                outerHTML = MARKUP_TITLE + outerHTML + MARKUP_LINEBREAK;
                break;
            case "H3":
                outerHTML = MARKUP_SUBTITLE + outerHTML + MARKUP_LINEBREAK;
                break;
            case "LI":
                if (childNode.classList.contains("ordered")) {
                    if (childNode.classList.contains("first")) {
                        olIndex = 1;
                    }
                    outerHTML = olIndex + ". " + outerHTML + MARKUP_LINEBREAK;
                    olIndex++;
                } else {
                    outerHTML = MARKUP_LI + outerHTML + MARKUP_LINEBREAK;
                }
                break;
            case "B":
                outerHTML = "**" + outerHTML + "**";
                break;
            case "INPUT":
                if (childNode.type == "checkbox") {
                    // converts based on the checked value.
                    // since the nodes have been re-created, this is actually the default value
                    // so SaveCheckboxValuesToDefault() should be called first to save their values to the DOM
                    if (childNode.checked) { 
                        outerHTML = MARKUP_CHK_CHECKED + outerHTML;
                    } else {
                        outerHTML = MARKUP_CHK_UNCHECKED + outerHTML;
                    }
                }
                break;
            case "SPAN":
                if (childNode.classList.contains("monospace")) {
                    outerHTML = "`" + outerHTML + "`";
                }
                break;
        }
        childNode.outerHTML = outerHTML;
    }

    // remove redundant trailing line breaks from conversions
    htmlNode.innerHTML = htmlNode.innerHTML.trimEnd();

    return processedNodesCount;
}

// converts an html string into db markup language and returns it
function ContentHtmlToMarkup(html) {
    
    const parsingDiv = document.createElement("div");
    parsingDiv.innerHTML = html;

    let parsedNodes = 0;
    do {
        parsedNodes = HtmlNodeToMarkup(parsingDiv);
    } while (parsedNodes > 0);

    return parsingDiv.innerHTML;
}

// converts an html string into db markup language and returns it.
// differently from ContentHtmlToMarkup() preserve some html tags that make it esier to edit it.
function ContentHtmlToMarkupEditing(html) {
    let editableMarkup = ContentHtmlToMarkup(html);

    // preserve new lines
    editableMarkup = editableMarkup.replaceAll("\n", "<br>");

    return editableMarkup;
}