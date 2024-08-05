class TaralloServer {
	static async JsonRequest(pageUrl, postParams) {	
		const requestOptions = {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(postParams)
		};

		let result = { succeeded: false, error: "" };

		activeJsonRequest: {

			// fetch the response
			let response;
			try {
				response = await fetch(pageUrl, requestOptions);
			} catch {
				result.error = "Network error.";
				break activeJsonRequest;
			}

			// check response code
			if (!response.ok) {
				result.error = await response.text();
				if (result.error.length == 0) {
					// set default error message if missing.
					result.error = `Request failed for page ${pageUrl} with code ${response.status} (${response.statusText})\n`;
				}
				break activeJsonRequest;
			}

			// if succeeded, invoke the callback with the json
			const responseJson = await response.text();
			try {
				result.response = JSON.parse(responseJson);
			} catch {
				// error parsing the json response, try to print the content
				result.error = `Json parsing error from page ${pageUrl}:\n`;
				result.error += responseJson;
				break activeJsonRequest;
			}

			result.succeeded = true;
		}

		if (!result.succeeded) {
			// error occurred in the request, log
			console.error(result.error);
		}

		return result;
	}

	static async Call(apiName, params) {
		// add operation name to the params
		let postParams = { "OP": apiName };

		// add params from query string
		for (const [key, value] of TaralloUtils.GetQueryStringParams()) {
			postParams[key] = value;
		}

		// add user params
		Object.assign(postParams, params);

		// make the request and return its promise
		return TaralloServer.JsonRequest("php/api.php", postParams);
	}

	// call to a server function, made to be used asynchronously, accepting callbacks on success and error
	static async AsyncCall(apiName, params, successCallback, errorCallback) {
		// make the request and wait
		const result = await TaralloServer.Call(apiName, params);
		// invoke the appropriate callback, depending on the result
		if (result.succeeded) {
			successCallback(result.response);
		} else {
			errorCallback(result.error);
		}
	}
}