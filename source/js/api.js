class TaralloServer {
	static async JsonRequest(pageUrl, postParams, successCallback, errorCallback) {	
		const requestOptions = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(postParams)
		};

		let requestError = "";

		activeJsonRequest: {

			// fetch the response
			let response;
			try {
				response = await fetch(pageUrl, requestOptions);
			} catch {
				requestError = "Network error.";
				break activeJsonRequest;
			}

			// check response code
			if (!response.ok) {
				requestError = await response.text();
				if (requestError.length == 0) {
					// set default error message if missing.
					requestError = `Request failed for page ${pageUrl} with code ${response.status} (${response.statusText})\n`;
				}
				break activeJsonRequest;
			}

			// if succeeded, invoke the callback with the json
			const responseJson = await response.text();
			let responseObj;
			try {
				responseObj = JSON.parse(responseJson);
			} catch {
				// error parsing the json response, try to print the content
				requestError = `Json parsing error from page ${pageUrl}:\n`;
				requestError += responseJson;
				break activeJsonRequest;
			}

			// invoke the final callback on success
			successCallback(responseObj);
			return;
		}

		// error occurred in the request, log errors
		console.error(requestError);
		if (errorCallback) {
			errorCallback(requestError);
		}
	}

	static async Call(apiName, params, successCallback, errorElementID) {
		// add operation name to the params
		let postParams = { "OP": apiName };

		// add params from query string
		for (const [key, value] of TaralloUtils.GetQueryStringParams()) {
			postParams[key] = value;
		}

		// add user params
		Object.assign(postParams, params);
		TaralloServer.JsonRequest("php/api.php", postParams, successCallback, errorElementID);
	}
}