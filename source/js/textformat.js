const MARKUP_TITLE = "# ";
const MARKUP_SUBTITLE = "## ";
const MARKUP_SUBTITLE2 = "### ";
const MARKUP_CHK_CHECKED = "[x] ";
const MARKUP_CHK_UNCHECKED = "[ ] ";
const MARKUP_CODE_MULTILINE = "```";
const MARKUP_LI = "- ";
const MARKUP_LINEBREAK = "\n";
const MARKUP_IMAGE_START = "![";
const MARKUP_IMAGE_SEP = "](";
const MARKUP_IMAGE_END = ")";
const MARKUP_IMAGE_ATTACHMENT = "#"; 
const MARKUP_INDENT = "    ";

const languages = {
    'cpp': [
        ['const', 'int', 'float', 'double'],
        ['if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return'],
        ['&&', '||', '==', '!=', '-&gt;', '&gt;', '&lt;', '++', '--']
    ],
    'hlsl':[
        ['int', 'float', 'double', 'float2', 'float3', 'float4', 'float4x4'],
        ['if', 'else', 'for', 'while', 'do', 'break', 'continue', 'return'],
        ['&&', '||', '==', '!=', '-&gt;', '&gt;', '&lt;', '++', '--']
    ]
};

function ArrayToRegex(lang, index) {
    const regexBody = languages[lang][index]
        .join('##')
        .replaceAll('|', String.raw`\|`)
        .replaceAll('+', String.raw`\+`)
        .replaceAll('##', '|');

    if (index < 2)
        return new RegExp('\\b(' + regexBody + ')\\b', 'g');
    else
        return new RegExp('(' + regexBody + ')', 'g');
}

function ParseMarkupListItem(markup) {
    const markupLineNoIndent = markup.trimStart();

    if (markupLineNoIndent.startsWith(MARKUP_LI + MARKUP_CHK_UNCHECKED)) {
        return {'isListItem': true, 'isOrdererd': false, 'isCheckbox': true, 'isChecked': false, 'prefixLen': MARKUP_LI.length + MARKUP_CHK_UNCHECKED.length };        
    } else if (markupLineNoIndent.startsWith(MARKUP_LI + MARKUP_CHK_CHECKED)) {
        return {'isListItem': true, 'isOrdererd': false, 'isCheckbox': true, 'isChecked': true, 'prefixLen': MARKUP_LI.length + MARKUP_CHK_CHECKED.length  };        
    } else if (markupLineNoIndent.startsWith(MARKUP_LI)) {
        return {'isListItem': true, 'isOrdererd': false, 'isCheckbox': false, 'isChecked': false, 'prefixLen': MARKUP_LI.length };        
    } else if (/^\d+?\.\s/.test(markupLineNoIndent)) {
        return {'isListItem': true, 'isOrdererd': true, 'isCheckbox': false, 'isChecked': false, 'prefixLen': markupLineNoIndent.indexOf(".") + 2 };        
    }

    return {'isListItem': false, 'isOrdererd': false, 'isCheckbox': false, 'isChecked': false, 'prefixLen': 0 };
}

// converts the db markup language to displayable html
function ContentMarkupToHtml(markup, attachmentList) {
    let html = "";
    let markupLines = markup.split(MARKUP_LINEBREAK);
    let isCodeLine = false;
    let keywords1 = undefined, keywords2 = undefined, keywords3 = undefined;


    // html tag stack tracking
    let tagStack = [];
    function getParentTag(level = 1) {
        if (tagStack.length < level) {
            return {'name': "html", 'indent': 0, 'islist': false};
        }
        return tagStack[tagStack.length - level];
    }
    function popTag() {
        if (tagStack.length === 0) {
            return "";
        }
        const tag = tagStack.pop();
        return "</" + tag.name + ">";
    }
    function pushTag(name) {
        const newTag = {'name': name, 'indent': 0, 'islist': false};
        tagStack.push(newTag);
        return "<" + name + ">";
    }
    function pushListTag(name, indent) {
        const newTag = {'name': name, 'indent': indent, 'islist': true, 'count': 1, 'indentLevel': 0};
        let result = "";
        
        // pop all more nested lists
        while (getParentTag().indent > indent && getParentTag().islist) {
            result += popTag();
        }
        // pop same indent list if different
        if (getParentTag().name !== name && getParentTag().indent == indent && getParentTag().islist) {
            result += popTag();
        }

        // for lists the push is always called, and automatically skipped here if the indentation matches
        if (getParentTag().name !== name || getParentTag().islist && getParentTag().indent < indent) {
            newTag.indentLevel = getParentTag().islist ? getParentTag().indentLevel + 1 : 0;
            tagStack.push(newTag);
            result += "<" + name + ">";
        } else {
            tagStack[tagStack.length - 1].count++;
        }
        
        return result;
    }

    // foreach markup line
    for (let i = 0; i < markupLines.length; i++) {

        let markupLine = markupLines[i];

        const isImage = markupLine.startsWith(MARKUP_IMAGE_START) && markupLine.endsWith(MARKUP_IMAGE_END) && markupLine.includes(MARKUP_IMAGE_SEP);
        const isLastLine = (i + 1) === markupLines.length;
        const listItem = ParseMarkupListItem(markupLine);
        let lineIndent = 0;

        // === convert inline tokens
        if (isCodeLine && keywords1) {
            // code: label all keywords
            markupLine = markupLine.replaceAll(keywords1, "##1$1##e"); // keywords1
            markupLine = markupLine.replaceAll(keywords2, "##2$1##e"); // keywords2
            markupLine = markupLine.replaceAll(keywords3, "##3$1##e"); // keywords3
            // translate keywords to html
            markupLine = markupLine.replaceAll(/##(\d)/g, "<span class='keyword$1'>");
            markupLine = markupLine.replaceAll(/##e/g, "</span>");
        } else if (!isImage) {
            // generic text

            // calc line indentation
            for(; lineIndent < markupLine.length && markupLine[lineIndent] === ' '; lineIndent++);

            // bold
            markupLine = markupLine.replaceAll(/\*\*(.*?)\*\*/g, "<b>$1</b>"); 
            // monospace
            markupLine = markupLine.replaceAll(/`([^`]+?)`/g, "<span class=\"monospace\">$1</span>"); 
            // links
            const mouseDownJS = "if (event.which == 1) { window.open(\"$1\", \"_blank\"); event.preventDefault(); }";
            markupLine = markupLine.replaceAll(/(https?:\/\/.*?)(\s|$)/g, "<a onmousedown='" + mouseDownJS + "' href='$1' contentEditable='false'>$1</a>$2"); 
        }

        // === convert line start tokens
        let lineHtml = "";
        const markupLineNoIndent = markupLine.substring(lineIndent);

        if (markupLineNoIndent.startsWith(MARKUP_TITLE)) {
            // title
            lineHtml = "<h2>" + markupLineNoIndent.substring(MARKUP_TITLE.length) + "</h2>";
        } else if (markupLineNoIndent.startsWith(MARKUP_SUBTITLE)) {
            // subtitle
            lineHtml = "<h3>" + markupLineNoIndent.substring(MARKUP_SUBTITLE.length) + "</h3>";
        } else if (markupLineNoIndent.startsWith(MARKUP_SUBTITLE2)) {
            // subtitle
            lineHtml = "<h4>" + markupLineNoIndent.substring(MARKUP_SUBTITLE2.length) + "</h4>";
        } else if (listItem.isListItem) {
            // list item
            lineHtml += pushListTag(listItem.isOrdererd ? "ol" : "ul", lineIndent);
            let classes = listItem.isOrdererd ? "ordered " : "";
            let style = listItem.isCheckbox ? "list-style-type: none" : "";
            if (getParentTag().count === 1) {
                classes += "first "
            }
            lineHtml += "<li class='" + classes + "' style='" + style + "' indent=" + getParentTag().indentLevel + ">";

            if (listItem.isCheckbox) {
                // checkbox
                lineHtml += "<span contenteditable=false><input type='checkbox'" + (listItem.isChecked ? " checked='checked'" : "") +"></span>";
            }
            lineHtml += markupLineNoIndent.substring(listItem.prefixLen);
            lineHtml += "</li>";
        } else if (markupLineNoIndent.startsWith(MARKUP_CODE_MULTILINE)) {
            const multlineClosingTag = "</pre></div>";
            if (getParentTag().name !== "pre") {
                const langName = markupLineNoIndent.substring(MARKUP_CODE_MULTILINE.length).trim();

                // start of multiline code block
                pushTag("div");
                lineHtml += `<div class="multiline-container">`;
                // copy to clipboard button
                lineHtml += "<span contenteditable=false class='copy-btn'><svg class=\"dim-icon\"><use href=\"#icon-copy\" /></svg></span>";
                // monospace code block
                pushTag("pre");
                lineHtml += `<pre class="monospace" lang="${langName}">`;

                // create regex for the specified language
                if (langName.length > 0 && languages[langName]) {
                    keywords1 = ArrayToRegex(langName, 0);
                    keywords2 = ArrayToRegex(langName, 1);
                    keywords3 = ArrayToRegex(langName, 2);
                }
                isCodeLine = true;
            } else {
                // end of multiline code block
                lineHtml += popTag() + popTag();
                isCodeLine = false;
                keywords1 = undefined;
                keywords2 = undefined;
                keywords3 = undefined;
            }
        } else if (isImage) {
            // image markup
            const imageMarkupElems = markupLine.substring(MARKUP_TITLE.length, markupLine.length - MARKUP_IMAGE_END.length).split(MARKUP_IMAGE_SEP);
            let imgAlt = imageMarkupElems[0];
            let imgUrl = imageMarkupElems[1];
            let attachmentName = "";
            if (imageMarkupElems[1].startsWith(MARKUP_IMAGE_ATTACHMENT) && attachmentList) {
                // refers to an attachment
                attachmentQuery = imageMarkupElems[1].substring(MARKUP_IMAGE_ATTACHMENT.length);
                const attachment = attachmentList.find(a => a['name'] == attachmentQuery);
                if (attachment) {
                    // attachment found, update the url to the one in the attachment
                    imgUrl = attachment['url'];
                    attachmentName = attachmentQuery;
                }
            }
            // build image html
            lineHtml += `<img class="content-img" src="${imgUrl}" alt="${imgAlt}" attachmentName="${attachmentName}">`

        } else if (markupLine.trim().length == 0) {
            // empty line

            // close lists on empty line
            while (getParentTag().islist) {
                lineHtml += popTag();
            }

            if (!isLastLine) {
                lineHtml += "<br>";
            }
        } else {
            // simple text
            lineHtml = "<p>" + markupLine + "</p>";
        }

        html += lineHtml;
    }

    // close all remaining tags
    while (tagStack.length > 0) {
        html += popTag();
    }

    return html;
}

function GetImageMarkup(imgUrl, imgAlt, attachmentName) {
    if (attachmentName && attachmentName.length > 0) {
        // attachment reference: save name instead of the url
        imgUrl = MARKUP_IMAGE_ATTACHMENT + attachmentName;
    }
    return MARKUP_IMAGE_START + imgAlt + MARKUP_IMAGE_SEP + imgUrl + MARKUP_IMAGE_END;
}

// converts a DOM node to the db markup language
function HtmlNodeToMarkup(htmlNode) {
    let curChildNodes = Array.from(htmlNode.childNodes);
    let processedNodesCount = curChildNodes.length;

    // early out if there are no children to process
    if (processedNodesCount == 0) {
        return 0;
    }

    let olIndex = 0;
    let indent = "";
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
            case "H4":
                outerHTML = MARKUP_SUBTITLE2 + outerHTML + MARKUP_LINEBREAK;
                break;
            case "LI":
                let indentSpacing = ""
                for (let ind = childNode.getAttribute("indent"); ind > 0; ind--) {
                    indentSpacing += MARKUP_INDENT;
                }
                if (childNode.classList.contains("ordered")) {
                    if (childNode.classList.contains("first")) {
                        olIndex = 1;
                    }
                    outerHTML = indentSpacing + olIndex + ". " + outerHTML + MARKUP_LINEBREAK;
                    olIndex++;
                } else {
                    outerHTML = indentSpacing + MARKUP_LI + outerHTML + MARKUP_LINEBREAK;
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
            case "PRE":
                if (childNode.classList.contains("monospace")) {
                    outerHTML = MARKUP_CODE_MULTILINE + childNode.getAttribute("lang") + MARKUP_LINEBREAK + outerHTML + MARKUP_CODE_MULTILINE;
                }
                break;
            // tags that will be completely removed, content included
            case "SVG":
                outerHTML = "";
                break;
            case "IMG":
                imgUrl = childNode.getAttribute("src");
                imgAlt = childNode.getAttribute("alt");
                attachmentName = childNode.getAttribute("attachmentName");
                outerHTML = GetImageMarkup(imgUrl, imgAlt, attachmentName) + MARKUP_LINEBREAK;
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

function DecodeHTMLEntities(text) {
    const span = document.createElement('span');

    return text
        .replace(/&[#A-Za-z0-9]+;/gi, (entity, position, text) => {
            span.innerHTML = entity;
            return span.innerText;
        });
}