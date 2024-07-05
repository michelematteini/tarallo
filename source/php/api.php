<?php
require_once 'config.php';
require_once 'utils.php';
require_once 'dbaccess.php';


// page initialization
header('Content-Type: application/json; charset=utf-8');
session_start(['cookie_samesite' => 'Strict',]); 

// initialize parameters
$request = Utils::DecodePostJSON(); // params posted as json
$request = array_merge($request == null ? array() : $request, $_GET); // params added to the url

// check the the api call name has been specified 
// and it's a valid API call
if (!isset($request['OP']) || !method_exists("API", $request['OP'])) {
	http_response_code(400);
	exit("Invalid 'OP' code: " . $request['OP']);
}

// call the requested API and echo the result as JSON
$methodName = "API::" . $request['OP'];
$response = $methodName($request);
echo json_encode($response);

// contains all the tarallo api calls
class API 
{
	const DEFAULT_BG = "images/tarallo-bg.jpg";
	const DEFAULT_BOARDTILE_BG = "images/boardtile-bg.jpg";
	const DEFAULT_LABEL_COLORS = array("red", "orange", "yellow", "green", "cyan", "azure", "blue", "purple", "pink", "grey");

	// user types for the permission table
	const USERTYPE_Owner = 0; // full-control of the board
	const USERTYPE_Admin = 2; // full-control of the board, exept a few functionalities like board permanent deletion
	const USERTYPE_Member = 6; // full-control of the cards but no access to board layout and options
	const USERTYPE_Observer = 8; // read-only access to the board
	const USERTYPE_Guest = 9; // no access, but user requested to join the board
	const USERTYPE_Blocked = 10; // no access (blocked by a board admin)
	const USERTYPE_None = 11; // no access (no record on db)

	// special user IDs
	const USERID_ONREGISTER = -1; // if a permission record on the permission table has this user_id, the permission will be copied to any new registered user

	// request the page that should be displayed for the current state
	public static function GetCurrentPage($request)
	{
		$response = array();
		if (isset($_SESSION["logged_in"])) 
		{
			if (isset($request["board_id"])) 
			{
				$response = self::GetBoardPage($request);
			}
			else 
			{
				$response = self::GetBoardListPage($request);
			}		
		} 
		else 
		{
			// login page data
			$response["page_name"] = "Login";
			$response["page_content"] = array();
			$response["page_content"]["background_img_url"] = self::DEFAULT_BG;
		}

		return $response;
	}

	public static function GetBoardListPage($request) 
	{
		$response = array();

		// query all the boards available to this user
		$boardsQuery = "SELECT tarallo_boards.*, tarallo_permissions.user_type";
		$boardsQuery .= " FROM tarallo_boards INNER JOIN tarallo_permissions ON tarallo_boards.id = tarallo_permissions.board_id";
		$boardsQuery .= " WHERE tarallo_permissions.user_id  = :user_id";
		
		DB::setParam("user_id", $_SESSION["user_id"]); 
		$results = DB::fetch_table($boardsQuery);

		self::CheckPermissions($results["user_type"], self::USERTYPE_Observer);

		// fill an array of all the user boards
		$boardList = array();
		foreach ($results as $boardRecord) 
		{
			$boardList[] = self::BoardRecordToData($boardRecord);
		}

		// prepare json response
		$response["page_name"] = "BoardList";
		$pageContent["boards"] = $boardList;
		$pageContent["background_url"] = self::DEFAULT_BG;
		$pageContent["background_tiled"] = true;
		$pageContent["display_name"] = $_SESSION["display_name"];
		$response["page_content"] = $pageContent;

		return $response;
	}

	public static function GetBoardPage($request)
	{
		if (!isset($request["board_id"]))
		{
			http_response_code(400);
			exit("The parameter board_id of the requested board is missing!");
		}

		// query board data
		$boardID = $request["board_id"];
		$boardData = self::GetBoardData($boardID, self::USERTYPE_None);

		if ($boardData["user_type"] >= self::USERTYPE_Guest)
		{
			// dont have a permission, or it's not enough to view the board
			// return a page to notify the user
			$response = array();
			$response["page_name"] = "UnaccessibleBoard";
			$pageContent = array();
			$pageContent["id"] = $boardID;
			$pageContent["display_name"] = $_SESSION["display_name"];
			$pageContent["access_requested"] = $boardData["user_type"] == self::USERTYPE_Guest;
			$response["page_content"] = $pageContent;
			return $response;
		}

		// fill in board data
		$pageContent = $boardData;
		$pageContent["display_name"] = $_SESSION["display_name"];

		if ($boardData["closed"])
		{
			// this board is closed, just return basic data with another page name
			$response = array();
			$response["page_name"] = "ClosedBoard";
			$response["page_content"] = $pageContent;
			return $response;
		}

		// query board cardlists
		$cardlistsQuery = "SELECT id, name, prev_list_id, next_list_id FROM tarallo_cardlists WHERE board_id = :board_id";
		DB::setParam("board_id", $boardID);
		$cardlists = DB::fetch_table($cardlistsQuery, "id");

		// fill in cardlist data
		$pageContent["cardlists"] = $cardlists;

		// query the board's cards
		$cardsQuery = "SELECT * FROM tarallo_cards WHERE board_id = :board_id";
		DB::setParam("board_id", $boardID);
		$cardRecords = DB::fetch_table($cardsQuery);

		// fill in cards data
		$cards = array();
		foreach ($cardRecords as $cardRecord) 
		{
			$cards[] = self::CardRecordToData($cardRecord);
		}
		$pageContent["cards"] = $cards;

		// prepare json response
		$response = array();
		$response["page_name"] = "Board";
		$response["page_content"] = $pageContent;

		return $response;
	}
	
	public static function Login($request)
	{
		if (self::IsUserLoggedIn())
		{
			self::LogoutInternal();
		}

		$userQuery = "SELECT * FROM tarallo_users WHERE username = :username";
		DB::setParam("username", $request["username"]);
		$userRecord = DB::fetch_row($userQuery);
					
		if (!$userRecord) 
		{
			goto failed_login;
		}		

		if (strlen($userRecord["password"]) == 0) 
		{
			// first login, accept and save the specified password
			$passwordHash = password_hash($request["password"], PASSWORD_DEFAULT);
			$setPasswordQuery = "UPDATE tarallo_users SET password = :passwordHash WHERE username = :username";
			DB::setParam("username", $request["username"]);
			DB::setParam("passwordHash", $passwordHash);
			DB::query($setPasswordQuery);
			
			// update the record query so that the newly created password will be verified
			DB::setParam("username", $request["username"]);
			$userRecord = DB::fetch_row($userQuery);
		} 
		
		if (!password_verify($request["password"], $userRecord["password"])) 
		{
			// wrong password (or new password not correctly added to the DB)
			goto failed_login;
		}

		// ===== successful login!
		
		// update session
		$_SESSION["logged_in"] = true;
		$_SESSION["user_id"] = $userRecord["id"];
		$_SESSION["username"] = $userRecord["username"];
		$_SESSION["display_name"] = $userRecord["display_name"];
		
		// update last login time in db
		$updateLoginTimeQuery = "UPDATE tarallo_users SET last_access_time = :last_access_time WHERE id = :user_id";
		DB::setParam("last_access_time", time());
		DB::setParam("user_id", $userRecord["id"]);
		DB::query($updateLoginTimeQuery);

		// response
		$response = array();
		return $response;

		// ===== failed login
		failed_login:
		http_response_code(401);
		exit("Invalid username or password!");
	}

	public static function Register($request) 
	{
		if (!self::GetDBSetting("registration_enabled"))
		{
			http_response_code(403);
			exit("Account creation is disabled on this server!");
		}

		if (self::IsUserLoggedIn())
		{
			self::LogoutInternal();
		}

		// validate username
		if (strlen($request["username"]) < 5)
		{
			http_response_code(400);
			exit("Username is too short!");
		}
		if (!preg_match("/^[A-Za-z0-9]*$/", $request["username"]))
		{
			http_response_code(400);
			exit("Username must be alpha-numeric and cannot contain spaces!");
		}
		
		// validate display name
		$cleanDisplayName = trim($request["display_name"]);
		if (strlen($cleanDisplayName) < 3)
		{
			http_response_code(400);
			exit("Display name is too short!");
		}
		if (!preg_match("/^[A-Za-z0-9\s]*$/", $cleanDisplayName))
		{
			http_response_code(400);
			exit("Display name must be alpha-numeric.");
		}

		// validate password
		if (strlen($request["password"]) < 5)
		{
			http_response_code(400);
			exit("The password must be at least 5 char long!");
		}

		// check if the specified username already exists
		$userQuery = "SELECT COUNT(*) FROM tarallo_users where username = :username";
		DB::setParam("username", $request["username"]);
		$userExists = DB::query_one_result($userQuery);
			
		if ($userExists) 
		{
			http_response_code(400);
			exit("Username already in use! Try another one.");
		}

		// add the new user record to the DB
		$passwordHash = password_hash($request["password"], PASSWORD_DEFAULT);
		$addUserQuery = "INSERT INTO tarallo_users (username, password, display_name, register_time, last_access_time)";
		$addUserQuery .= " VALUES(:username, :password, :display_name, :register_time, 0)";
		DB::setParam("username", $request["username"]);
		DB::setParam("password", $passwordHash);
		DB::setParam("display_name", $cleanDisplayName);
		DB::setParam("register_time", time());
		$userID = DB::query($addUserQuery, true);

		if (!$userID) 
		{
			http_response_code(500);
			exit("Internal server error while creating the new user.");
		}

		// add initial permissions (if any is defined)
		DB::setParam("user_id", self::USERID_ONREGISTER);
		$initialPermissions = DB::fetch_table("SELECT * FROM tarallo_permissions where user_id = :user_id");
		$initialPermissionCount = count($initialPermissions);
		if ($initialPermissionCount)
		{
			$addPermsQuery = "INSERT INTO tarallo_permissions (user_id, board_id, user_type) VALUES ";
			$recordPlaceholders = "(?, ?, ?)";
			// foreach permission...
			for ($i = 0; $i < $initialPermissionCount; $i++) 
			{
				$curPermissions = $initialPermissions[$i];

				// add query parameters
				DB::$qparams[] = $userID;
				DB::$qparams[] = $curPermissions["board_id"];
				DB::$qparams[] = $curPermissions["user_type"];
				
				// add query format
				$addPermsQuery .= ($i > 0 ? ", " : "") . $recordPlaceholders;
			}

			// add all the initial permissions
			DB::query($addPermsQuery);
		}

		$response = array();
		$response["username"] = $request["username"];
		return $response;
	}

	public static function Logout($request)
	{
		self::LogoutInternal();
		$response = array();
		return $response;
	}

	public static function OpenCard($request) 
	{
		// fetch and validate card data
		$openCardQuery = "SELECT tarallo_cards.*, tarallo_permissions.user_type";
		$openCardQuery .= " FROM tarallo_cards INNER JOIN tarallo_permissions ON tarallo_cards.board_id = tarallo_permissions.board_id";
		$openCardQuery .= " WHERE tarallo_cards.id = :id AND tarallo_permissions.user_id = :user_id";
		DB::setParam("user_id", $_SESSION["user_id"]); 
		DB::setParam("id", $request["id"]);

		// init the response with the card data and its content
		$cardRecord = DB::fetch_row($openCardQuery);
		$response = self::CardRecordToData($cardRecord);
		$response["content"] = $cardRecord["content"];

		self::CheckPermissions($response["user_type"], self::USERTYPE_Observer);

		if (!$response)
		{
			http_response_code(404);
			exit("The specified id does not exists or the user do not have access to the board.");
		}

		// fetch attachments
		$attachmentsQuery = "SELECT * FROM tarallo_attachments WHERE card_id = :card_id";
		DB::setParam("card_id", $request["id"]);
		$attachmentList = DB::fetch_table($attachmentsQuery);
		$attachmentCount = count($attachmentList);
		$response["attachmentList"] = array();
		for ($i = 0; $i < $attachmentCount; $i++) 
		{
			$response["attachmentList"][] = self::AttachmentRecordToData($attachmentList[$i]);
		}
		
		return $response;
	}

	public static function AddNewCard($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		//query and validate cardlist id
		$cardlistData = self::GetCardlistData($request["board_id"], $request["cardlist_id"]);

		// add the card to the DB
		$newCardRecord = self::AddNewCardInternal(
			$request["board_id"], 
			$request["cardlist_id"], 
			0, // prev_card_id as 0 means adding at the top of the cardlist
			$request["title"],
			"Insert the card description here.",
			"0", // cover_attachment_id
			time(), // last_moved_time
			0, // label_mask
			0 // flags
		);

		self::UpdateBoardModifiedTime($request["board_id"]);

		// prepare the response
		$response = self::CardRecordToData($newCardRecord);
		return $response;
	}

	public static function DeleteCard($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		// delete the card
		self::DeleteCardInternal($request["board_id"], $request["deleted_card_id"]);

		self::UpdateBoardModifiedTime($request["board_id"]);
	}

	public static function MoveCard($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		//query and validate cardlist id
		$cardlistData = self::GetCardlistData($request["board_id"], $request["dest_cardlist_id"]);

		// move the card
		try
		{
			DB::beginTransaction();

			// delete the original card
			$cardRecord = self::DeleteCardInternal($request["board_id"], $request["moved_card_id"], false);

			// update last_move_time only if the card list is changing
			$lastMovedTime = $cardRecord["cardlist_id"] != $request["dest_cardlist_id"] ? time() : $cardRecord["last_moved_time"];
			
			// add the card at the new location
			$newCardRecord = self::AddNewCardInternal(
				$request["board_id"], 
				$request["dest_cardlist_id"], 
				$request["new_prev_card_id"],
				$cardRecord["title"],
				$cardRecord["content"],
				$cardRecord["cover_attachment_id"],
				$lastMovedTime,
				$cardRecord["label_mask"],
				$cardRecord["flags"]
			);

			// update attachments card_id
			$updateAttachmentsQuery = "UPDATE tarallo_attachments SET card_id = :new_card_id WHERE card_id = :old_card_id";
			DB::setParam("new_card_id", $newCardRecord["id"]);
			DB::setParam("old_card_id", $request["moved_card_id"]);
			DB::query($updateAttachmentsQuery);

			self::UpdateBoardModifiedTime($request["board_id"]);

			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}

		// prepare the response
		$response = self::CardRecordToData($newCardRecord);
		return $response;
	}

	public static function MoveCardList($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Admin);

		//query and validate cardlist id
		$cardListData = self::GetCardlistData($request["board_id"], $request["moved_cardlist_id"]);

		// query and validate the prev cardlist if any, and get the next list ID
		$nextCardListID = 0;
		if ($request["new_prev_cardlist_id"] > 0) 
		{
			$cardListPrevData = self::GetCardlistData($request["board_id"], $request["new_prev_cardlist_id"]);
			$nextCardListID = $cardListPrevData["next_list_id"];
		}
		else
		{
			// query the first cardlist, that will be the next after the moved one
			$nextCardListQuery = "SELECT * FROM tarallo_cardlists WHERE board_id = :board_id AND prev_list_id = 0";
			DB::setParam("board_id", $boardData['id']);
			$nextCardListRecord = DB::fetch_row($nextCardListQuery);
			$nextCardListID = $nextCardListRecord['id'];
		}

		// move the card list
		try
		{
			DB::beginTransaction();

			// update cardlist linked list
			self::RemoveCardListFromLL($cardListData);
			DB::setParam("prev_list_id", $request["new_prev_cardlist_id"]);
			DB::setParam("next_list_id", $nextCardListID);
			DB::setParam("id", $request["moved_cardlist_id"]);
			DB::query("UPDATE tarallo_cardlists SET prev_list_id = :prev_list_id, next_list_id = :next_list_id WHERE id = :id");
			self::AddCardListToLL($request["moved_cardlist_id"], $request["new_prev_cardlist_id"], $nextCardListID);

			self::UpdateBoardModifiedTime($request["board_id"]);

			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}

		// requery the list prepare the response
		$response = self::GetCardlistData($request["board_id"], $request["moved_cardlist_id"]);
		return $response;
	}

	public static function UpdateCardTitle($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		// query and validate card id
		$cardRecord = self::GetCardData($request["board_id"], $request["id"]);

		// update the card
		$titleUpdateQuery = "UPDATE tarallo_cards SET title = :title WHERE id = :id";
		DB::setParam("title", $request["title"]);
		DB::setParam("id", $request["id"]);
		DB::query($titleUpdateQuery);
		
		self::UpdateBoardModifiedTime($request["board_id"]);

		$cardRecord["title"] = $request["title"];
		return self::CardRecordToData($cardRecord);
	}

	public static function UpdateCardContent($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		// query and validate card id
		$cardRecord = self::GetCardData($request["board_id"], $request["id"]);

		// update the content
		$titleUpdateQuery = "UPDATE tarallo_cards SET content = :content WHERE id = :id";
		DB::setParam("content", $request["content"]);
		DB::setParam("id", $request["id"]);
		DB::query($titleUpdateQuery);

		self::UpdateBoardModifiedTime($request["board_id"]);

		$cardRecord["content"] = $request["content"];
		return self::CardRecordToData($cardRecord);
	}

	public static function UpdateCardFlags($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		// query and validate card id
		$cardRecord = self::GetCardData($request["board_id"], $request["id"]);

		// calculate the flag mask
		$cardFlagList = self::CardFlagMaskToList($cardRecord["flags"]);
		if (isset($request["locked"]))
			$cardFlagList["locked"] = $request["locked"];
		$cardRecord["flags"] = self::CardFlagListToMask($cardFlagList);

		// update the flags in the db
		$flagsUpdateQuery = "UPDATE tarallo_cards SET flags = :flags WHERE id = :id";
		DB::setParam("flags", $cardRecord["flags"]);
		DB::setParam("id", $request["id"]);
		DB::query($flagsUpdateQuery);

		self::UpdateBoardModifiedTime($request["board_id"]);

		return self::CardRecordToData($cardRecord);
	}

	public static function UploadAttachment($request)
	{
		// check attachment size
		$maxAttachmentSize = self::GetDBSetting("attachment_max_size_kb");
		if ($maxAttachmentSize && (strlen($request["attachment"]) * 0.75 / 1024) > self::GetDBSetting("attachment_max_size_kb"))
		{
			http_response_code(400);
			exit("Attachment is too big! Max size is $maxAttachmentSize kb");
		}

		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);
		// query and validate card id
		$cardRecord = self::GetCardData($request["board_id"], $request["card_id"]);

		// add attachment to the card in db
		$addAttachmentQuery = "INSERT INTO tarallo_attachments (name, guid, extension, card_id, board_id)";
		$addAttachmentQuery .= " VALUES (:name, :guid, :extension, :card_id, :board_id)";
		$fileInfo = pathinfo($request["filename"]);
		$extension = isset($fileInfo["extension"]) ? strtolower($fileInfo["extension"]) : "bin";
		$guid = uniqid("", true);
		DB::setParam("name", self::CleanAttachmentName($fileInfo["filename"]));
		DB::setParam("guid", $guid);
		DB::setParam("extension", $extension);
		DB::setParam("card_id", $request["card_id"]);
		DB::setParam("board_id", $request["board_id"]);
		$attachmentID = DB::query($addAttachmentQuery, true);
		
		if (!$attachmentID) 
		{
			http_response_code(500);
			exit("Failed to save the new attachment.");
		}

		// save attachment to file
		$filePath = self::GetAttachmentFilePath($request["board_id"], $guid, $extension);
		$fileContent = base64_decode($request["attachment"]);
		Utils::WriteToFile($filePath, $fileContent);

		// create a thumbnail
		$thumbFilePath = self::GetThumbnailFilePath($request["board_id"], $guid);
		Utils::CreateImageThumbnail($filePath, $thumbFilePath);
		if (Utils::FileExists($thumbFilePath)) 
		{
			// a thumbnail has been created, set it at the card cover image
			DB::setParam("attachment_id", $attachmentID);
			DB::setParam("card_id", $cardRecord["id"]);
			DB::query("UPDATE tarallo_cards SET cover_attachment_id = :attachment_id WHERE id = :card_id");
		}

		self::UpdateBoardModifiedTime($request["board_id"]);

		// re-query added attachment and card and return their data
		$attachmentRecord = self::GetAttachmentRecord($request["board_id"], $attachmentID);
		$response = self::AttachmentRecordToData($attachmentRecord);
		$cardRecord = self::GetCardData($request["board_id"], $request["card_id"]);
		$response["card"] = self::CardRecordToData($cardRecord);
		return $response;
	}

	public static function UploadBackground($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);

		// validate filename
		$fileInfo = pathinfo($request["filename"]);
		if (!isset($fileInfo["extension"]))
		{
			http_response_code(400);
			exit("Invalid image file!");
		}

		// save new background to file
		$extension = $fileInfo["extension"];
		$guid = uniqid("", true). "#" . $extension;
		$newBackgroundPath = self::GetBackgroundUrl($request["board_id"], $guid);
		$fileContent = base64_decode($request["background"]);
		Utils::WriteToFile($newBackgroundPath, $fileContent);

		// save a thumbnail copy of it for board tiles
		$newBackgroundThumbPath = self::GetBackgroundUrl($request["board_id"], $guid, true);
		Utils::CreateImageThumbnail($newBackgroundPath, $newBackgroundThumbPath);

		// delete old background files
		if (stripos($boardData["background_url"], self::DEFAULT_BG) === false) 
		{
			Utils::DeleteFile($boardData["background_url"]);
			Utils::DeleteFile($boardData["background_thumb_url"]);
		}

		// update background in DB
		DB::setParam("board_id", $request["board_id"]);
		DB::setParam("background_guid", $guid);
		DB::query("UPDATE tarallo_boards SET background_guid = :background_guid WHERE id = :board_id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		$boardData["background_url"] = $newBackgroundPath;
		$boardData["background_tiled"] = false;
		$boardData["background_thumb_url"] = $newBackgroundThumbPath;
		return $boardData;
	}

	public static function DeleteAttachment($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		// query attachment
		$attachmentRecord = self::GetAttachmentRecord($request["board_id"], $request["id"]);

		// delete attachments files
		self::DeleteAttachmentFiles($attachmentRecord);

		// delete attachment from db
		$deletionQuery = "DELETE FROM tarallo_attachments WHERE id = :id";
		DB::setParam("id", $request["id"]);
		DB::query($deletionQuery);
		
		// delete from cover image if any
		DB::setParam("attachment_id", $attachmentRecord["id"]);
		DB::setParam("card_id", $attachmentRecord["card_id"]);
		DB::query("UPDATE tarallo_cards SET cover_attachment_id = 0 WHERE cover_attachment_id = :attachment_id AND id = :card_id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		// re-query added attachment and card and return their data
		$response = self::AttachmentRecordToData($attachmentRecord);
		$cardRecord = self::GetCardData($attachmentRecord["board_id"], $attachmentRecord["card_id"]);
		$response["card"] = self::CardRecordToData($cardRecord);
		return $response;
	}

	public static function UpdateAttachmentName($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);

		// query attachment
		$attachmentRecord = self::GetAttachmentRecord($request["board_id"], $request["id"]);

		// update attachment name
		$filteredName = self::CleanAttachmentName($request["name"]);

		DB::setParam("id", $attachmentRecord["id"]);
		DB::setParam("name", $filteredName);
		DB::query("UPDATE tarallo_attachments SET name = :name WHERE id = :id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		// return the updated attachment data
		$attachmentRecord["name"] = $filteredName;
		$response = self::AttachmentRecordToData($attachmentRecord);
		return $response;
	}

	public static function ProxyAttachment($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Observer);

		// query attachment
		$attachmentRecord = self::GetAttachmentRecord($request["board_id"], $request["id"]);

		// output just the file (or its thumbnail)
		if (isset($request["thumbnail"]))
		{
			$attachmentPath = self::GetThumbnailFilePathFromRecord($attachmentRecord);
		}
		if (!isset($request["thumbnail"]) || !Utils::FileExists($attachmentPath))
		{
			$attachmentPath = self::GetAttachmentFilePathFromRecord($attachmentRecord);
		}

		$mimeType = Utils::MimeTypes[$attachmentRecord["extension"]];
		$downloadName = $attachmentRecord["name"] . "." . $attachmentRecord["extension"];
		$isImage = stripos($mimeType, "image") === 0;

		Utils::OutputFile($attachmentPath, $mimeType, $downloadName, !$isImage);
	}

	public static function UpdateCardListName($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);
		
		//query and validate cardlist id
		$cardlistData = self::GetCardlistData($request["board_id"], $request["id"]);

		// update the cardlist name
		DB::setParam("name", $request["name"]);
		DB::setParam("id", $request["id"]);
		DB::query("UPDATE tarallo_cardlists SET name = :name WHERE id = :id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		// return the cardlist data
		$cardlistData["name"] = $request["name"];
		return $cardlistData;
	}
	
	public static function AddCardList($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);

		// insert the new cardlist
		$newCardListData = self::AddNewCardListInternal($boardData["id"], $request["prev_list_id"], $request["name"]);

		self::UpdateBoardModifiedTime($request["board_id"]);

		return $newCardListData;
	}

	public static function DeleteCardList($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);

		//query and validate cardlist id
		$cardListData = self::GetCardlistData($request["board_id"], $request["id"]);

		// check the number of cards in the list (deletion of lists is only allowed when empty)
		DB::setParam("id", $request["id"]);
		$cardCount = DB::query_one_result("SELECT COUNT(*) FROM tarallo_cards WHERE cardlist_id = :id");

		if ($cardCount > 0)
		{
			http_response_code(400);
			exit("The specified list still contains cards and cannot be deleted!");
		}

		// delete the list
		self::DeleteCardListInternal($cardListData);

		self::UpdateBoardModifiedTime($request["board_id"]);

		return $cardListData;
	}

	public static function UpdateBoardTitle($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);
		
		// update the board title
		DB::setParam("title", self::CleanBoardTitle($request["title"]));
		DB::setParam("id", $request["board_id"]);
		DB::query("UPDATE tarallo_boards SET title = :title WHERE id = :id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		// requery and return the board data
		return self::GetBoardData($request["board_id"]);
	}

	public static function CreateNewBoard($request)
	{
		if (!self::IsUserLoggedIn())
		{
			http_response_code(403);
			exit("Cannot create a new board without being logged in.");
		}

		// create the new board
		$newBoardID = self::CreateNewBoardInternal($request["title"]);

		// re-query and return the new board data
		return self::GetBoardData($newBoardID);
	}

	public static function CloseBoard($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["id"]);
		
		// mark the board as closed
		DB::setParam("id", $request["id"]);
		DB::query("UPDATE tarallo_boards SET closed = 1 WHERE id = :id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		$boardData["closed"] = 1;
		return $boardData;
	}

	public static function ReopenBoard($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["id"]);
		
		// mark the board as closed
		DB::setParam("id", $request["id"]);
		DB::query("UPDATE tarallo_boards SET closed = 0 WHERE id = :id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		$boardData["closed"] = 0;
		return $boardData;
	}

	public static function DeleteBoard($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["id"]);
		
		// make sure the board is closed before deleting
		if (!$boardData["closed"])
		{
			http_response_code(400);
			exit("Cannot delete an open board.");
		}
		
		$boardID = $request["id"];

		// save attachment records before deleting them
		DB::setParam("board_id", $boardID);
		$attachments = DB::fetch_table("SELECT * FROM tarallo_attachments WHERE board_id = :board_id");

		// delete all the records from the board
		try
		{
			DB::beginTransaction();

			// delete board record
			DB::setParam("board_id", $boardID);
			DB::query("DELETE FROM tarallo_boards WHERE id = :board_id");

			// delete cardlists
			DB::setParam("board_id", $boardID);
			DB::query("DELETE FROM tarallo_cardlists WHERE board_id = :board_id");

			// delete cards
			DB::setParam("board_id", $boardID);
			DB::query("DELETE FROM tarallo_cards WHERE board_id = :board_id");

			// delete attachments
			DB::setParam("board_id", $boardID);
			DB::query("DELETE FROM tarallo_attachments WHERE board_id = :board_id");

			// delete permissions
			DB::setParam("board_id", $boardID);
			DB::query("DELETE FROM tarallo_permissions WHERE board_id = :board_id");

			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}
	
		// delete all board files
		$boardDir = self::GetBoardContentDir($boardID);
		Utils::DeleteDir($boardDir);

		return $boardData;
	}

	public static function ImportFromTrello($request) 
	{
		if (!self::IsUserLoggedIn())
		{
			http_response_code(403);
			exit("Cannot create a new board without being logged in.");
		}

		// check the next available card id
		$nextCardID = DB::query_one_result("SELECT MAX(id) FROM tarallo_cards") + 1;

		$trello = $request["trello_export"];

		// create the new board if any
		$newBoardID = self::CreateNewBoardInternal($trello["name"]);

		// add labels to the board
		$labelNames = array();
		$labelColors = array();
		foreach ($trello["labelNames"] as $key => $value) 
		{
			if (strlen($value) > 0)
			{
				$labelNames[] = self::CleanLabelName($value);
				$labelColors[] = self::DEFAULT_LABEL_COLORS[count($labelColors) % count(self::DEFAULT_LABEL_COLORS)];
			}
		}
		if (count($labelNames) > 0)
		{
			self::UpdateBoardLabelsInternal($newBoardID, $labelNames, $labelColors);
		}

		// prerare cards and lists data
		$trelloLists = $trello["lists"];
		$cardlistCount = count($trelloLists);
		$trelloCards = $trello["cards"];
		$cardCount = count($trelloCards);
		$prevCardlistID = 0;
		$clistCount = count($trello["checklists"]);

		// foreach list...
		for ($iList = 0; $iList < $cardlistCount; $iList++) 
		{
			$curTrelloList = $trelloLists[$iList];

			if ($curTrelloList["closed"])
				continue; // skip archived trello lists

			// create the list
			$newCardlistData = self::AddNewCardListInternal($newBoardID, $prevCardlistID, $curTrelloList["name"]);
			$newCardlistID = $newCardlistData["id"];
			

			// collect the trello cards for this list
			$curTrelloCards = array();
			$curTrelloListID = $curTrelloList["id"];
			for ($iCard = 0; $iCard < $cardCount; $iCard++) 
			{
				if ($trelloCards[$iCard]["closed"] || // card is archived (not supported, just discard)
					($trelloCards[$iCard]["idList"] !== $curTrelloListID)) // the card is from another list
				{
					continue; 
				}

				$curTrelloCards[] = $trelloCards[$iCard];
			}

			$listCardCount = count($curTrelloCards);
			
			if ($listCardCount > 0)
			{
				// sort cards in this list
				usort($curTrelloCards, [API::class, "CompareTrelloSortedItems"]);

				// prepare a query to add all the cards for this list
				$addCardsQuery = "INSERT INTO tarallo_cards (id, title, content, prev_card_id, next_card_id, cardlist_id, board_id, cover_attachment_id, last_moved_time, label_mask) VALUES ";
				$recordPlaceholders = "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
				// foreach card...
				for ($iCard = 0; $iCard < $listCardCount; $iCard++) 
				{
					$curTrelloCard = $curTrelloCards[$iCard];

					// convert due date to last moved time
					$lastMovedTime = 0;
					if (strlen($curTrelloCard["due"]) > 0)
					{
						$trelloDueDate = DateTime::createFromFormat("Y-m-d*H:i:s.v+", $curTrelloCard["due"]);
						if ($trelloDueDate)
							$lastMovedTime = $trelloDueDate->getTimestamp();
					}

					// convert card labels into a mask
					$labelMask = 0;
					foreach($curTrelloCard["labels"] as $trelloCardLabel)
					{
						$labelIndex = array_search($trelloCardLabel["name"], $labelNames);
						if ($labelIndex !== false)
							$labelMask += 1 << $labelIndex;
					}

					//convert all checklists to markup
					$clistContent = "";
					$clistCardCount = count($curTrelloCard["idChecklists"]);
					for ($iCardChk = 0; $iCardChk < $clistCardCount; $iCardChk++)
					{
						$chkGUID = $curTrelloCard["idChecklists"][$iCardChk];

						$cardChk = false;
						for($iChk = 0; $iChk < $clistCount; $iChk++)
						{
							if ($trello["checklists"][$iChk]["id"] === $chkGUID)
							{
								$cardChk = $trello["checklists"][$iChk];
								break;
							}
						}

						if (!$cardChk)
							continue; // checklist reference not found in the trello export?

						// sort checklist items
						usort($cardChk["checkItems"], [API::class, "CompareTrelloSortedItems"]);

						// convert checklist to markup
						$clistContent .= "\n## " . $cardChk["name"]; // title
						$chkItemsCount = count($cardChk["checkItems"]);
						for ($iItem = 0; $iItem < $chkItemsCount; $iItem++)
						{
							$chkItem = $cardChk["checkItems"][$iItem];
							$checkedStr = $chkItem["state"] == "complete" ? "x" : " ";
							$clistContent .= "\n- [$checkedStr] " . $chkItem["name"]; // item
						}

						// checklist termination
						$clistContent .= "\n";
					}

					// add query parameters
					DB::$qparams[] = $nextCardID; // id
					DB::$qparams[] = $curTrelloCard["name"]; // title
					DB::$qparams[] = $curTrelloCard["desc"] . $clistContent; // content
					DB::$qparams[] = $iCard == 0 ? 0 : ($nextCardID - 1); // prev_card_id
					DB::$qparams[] = $iCard == ($listCardCount - 1) ? 0 : ($nextCardID + 1);// next_card_id
					DB::$qparams[] = $newCardlistID;// cardlist_id
					DB::$qparams[] = $newBoardID;// board_id
					DB::$qparams[] = 0;// cover_attachment_id
					DB::$qparams[] = $lastMovedTime; // last_moved_time
					DB::$qparams[] = $labelMask;// label_mask

					// add query format
					$addCardsQuery .= ($iCard > 0 ? ", " : "") . $recordPlaceholders;

					$nextCardID++;

				} // end foreach card

				// add all the cards for this list to the DB
				DB::query($addCardsQuery);
			}

			$prevCardlistID = $newCardlistID;

		} // end foreach list

		// re-query and return the new board data
		return self::GetBoardData($newBoardID);
	}

	public static function CreateBoardLabel($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);

		// explode board label list
		$boardLabelNames = array();
		$boardLabelColors = array();
		if (strlen($boardData["label_names"]) > 0) 
		{
			$boardLabelNames = explode(",", $boardData["label_names"]);
			$boardLabelColors = explode(",", $boardData["label_colors"]);
		}
		$labelCount = count($boardLabelNames);

		// search for the first empty slot in the label mask if any
		$labelIndex = array_search("", $boardLabelNames);
		if ($labelIndex === false)
		{
			// no empty slot, add one
			$labelIndex = $labelCount;
			$boardLabelNames[] = "";
			$boardLabelColors[] = "";
		}
		
		// add a new label
		$newLabelColor = self::DEFAULT_LABEL_COLORS[$labelIndex % count(self::DEFAULT_LABEL_COLORS)];
		$boardLabelNames[$labelIndex] = $newLabelColor;
		$boardLabelColors[$labelIndex] = $newLabelColor;

		// update the board
		self::UpdateBoardLabelsInternal($request["board_id"], $boardLabelNames, $boardLabelColors);
		self::UpdateBoardModifiedTime($request["board_id"]);

		// return the updated labels
		$response = array();
		$response["label_names"] = implode(",", $boardLabelNames);
		$response["label_colors"] = implode(",", $boardLabelColors);
		$response["index"] = $labelIndex;
		return $response;
	}

	public static function UpdateBoardLabel($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);

		// explode board label list
		$boardLabelNames = explode(",", $boardData["label_names"]);
		$boardLabelColors = explode(",", $boardData["label_colors"]);
		$labelCount = count($boardLabelNames);
		 
		if (!isset($request["index"]) || $request["index"] >= $labelCount || $request["index"] < 0)
		{
			http_response_code(400);
			exit("Invalid parameters: the label <index> is required, and must be a smaller than the label count.");
		}

		// update the label name and color
		$labelIndex = $request["index"];
		$boardLabelNames[$labelIndex] = self::CleanLabelName($request["name"]);
		$boardLabelColors[$labelIndex] = $request["color"];
		
		// update the board
		self::UpdateBoardLabelsInternal($request["board_id"], $boardLabelNames, $boardLabelColors);
		self::UpdateBoardModifiedTime($request["board_id"]);

		// return the updated label
		$response = array();
		$response["index"] = $labelIndex;
		$response["name"] = $boardLabelNames[$labelIndex];
		$response["color"] = $boardLabelColors[$labelIndex];
		return $response;
	}

	public static function DeleteBoardLabel($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"]);

		// explode board label list
		$boardLabelNames = explode(",", $boardData["label_names"]);
		$boardLabelColors = explode(",", $boardData["label_colors"]);
		$labelCount = count($boardLabelNames);
		 
		if (!isset($request["index"]) || $request["index"] >= $labelCount || $request["index"] < 0)
		{
			http_response_code(400);
			exit("Invalid parameters: the label <index> is required, and must be a smaller than the label count.");
		}

		// remove the label name and color
		$labelIndex = $request["index"];
		$boardLabelNames[$labelIndex] = "";
		$boardLabelColors[$labelIndex] = "";

		// remove unused trailing elements
		while (strlen($boardLabelNames[$labelCount - 1]) == 0)
		{
			array_pop($boardLabelNames);
			array_pop($boardLabelColors);
			$labelCount--;
		}
		
		// update the board
		self::UpdateBoardLabelsInternal($request["board_id"], $boardLabelNames, $boardLabelColors);
		self::UpdateBoardModifiedTime($request["board_id"]);

		// remove the label flag from all the cards of this board
		DB::setParam("removed_label_mask", ~(1 << $labelIndex));
		DB::setParam("board_id", $request["board_id"]);
		DB::query("UPDATE tarallo_cards SET label_mask = label_mask & :removed_label_mask WHERE board_id = :board_id");

		// return the removed label index
		$response = array();
		$response["index"] = $labelIndex;
		return $response;
	}

	public static function SetCardLabel($request)
	{
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Member);
		

		if (!isset($request["index"]) || !isset($request["active"]))
		{
			http_response_code(400);
			exit("Missing parameters: both the label <index> and <active> are required.");
		}
		
		// explode board label list
		$boardLabelNames = explode(",", $boardData["label_names"]);
		$boardLabelColors = explode(",", $boardData["label_colors"]);
		$labelCount = count($boardLabelNames);
		$labelIndex = intval($request["index"]);
		$labelActive = $request["active"] ? 1 : 0;

		if ($labelIndex >= $labelCount || $labelIndex < 0) 
		{
			http_response_code(400);
			exit("The label index was out of bounds!");
		}

		// query and validate card id
		$cardData = self::GetCardData($request["board_id"], $request["card_id"]);

		// create the new mask
		$labelMask = $cardData["label_mask"];
		$selectMask = 1 << $labelIndex;
		$labelMask = ($labelMask & ~$selectMask) + $labelActive * $selectMask;

		// update the card
		DB::setParam("label_mask", $labelMask);
		DB::setParam("card_id", $cardData["id"]);
		DB::query("UPDATE tarallo_cards SET label_mask = :label_mask WHERE id = :card_id");

		self::UpdateBoardModifiedTime($request["board_id"]);

		// return info about the updated label
		$response = array();
		$response["card_id"] = $cardData["id"];
		$response["index"] = $labelIndex;
		$response["name"] = $boardLabelNames[$labelIndex];
		$response["color"] = $boardLabelColors[$labelIndex];
		$response["active"] = ($labelActive !== 0);

		return $response;
	}

	public static function GetBoardPermissions($request) {
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Admin);

		// query permissions for this board
		$boardPermissionsQuery = "SELECT tarallo_permissions.user_id, tarallo_users.display_name, tarallo_permissions.user_type";
		$boardPermissionsQuery .= " FROM tarallo_permissions INNER JOIN tarallo_users ON tarallo_permissions.user_id = tarallo_users.id";
		$boardPermissionsQuery .= " WHERE board_id = :board_id";
		DB::setParam("board_id", $request["id"]);
		$boardData["permissions"] = DB::fetch_table($boardPermissionsQuery);

		return $boardData;
	}

	public static function SetUserPermission($request) {
		// query and validate board id
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_Admin);

		if ($request["user_id"] == $_SESSION["user_id"]) 
		{
			http_response_code(400);
			exit("Cannot edit your own permissions!");
		}

		if ($request["user_type"] <= $boardData["user_type"]) 
		{
			http_response_code(400);
			exit("Cannot assign this level of permission.");
		}

		// query current user type
		$boardPermissionsQuery = "SELECT user_id, user_type FROM tarallo_permissions";
		$boardPermissionsQuery .= " WHERE board_id = :board_id AND user_id = :user_id";
		DB::setParam("board_id", $request["board_id"]);
		DB::setParam("user_id", $request["user_id"]);
		$permission = DB::fetch_row($boardPermissionsQuery);

		if (!$permission) 
		{
			http_response_code(404);
			exit("No permission for the specified user was found!");
		}

		if ($permission["user_type"] <= $boardData["user_type"])
		{
			http_response_code(404);
			exit("Cannot edit permissions for this user.");
		}


		// update permission
		$updatePermissionQuery = "UPDATE tarallo_permissions SET user_type = :user_type WHERE board_id = :board_id AND user_id = :user_id";
		DB::setParam("board_id", $request["board_id"]);
		DB::setParam("user_id", $request["user_id"]);
		DB::setParam("user_type", $request["user_type"]);
		DB::query($updatePermissionQuery);

		self::UpdateBoardModifiedTime($request["board_id"]);

		// query back for the updated permission
		DB::setParam("board_id", $request["board_id"]);
		DB::setParam("user_id", $request["user_id"]);
		$permission = DB::fetch_row($boardPermissionsQuery);

		return $permission;
	}

	public static function RequestBoardAccess($request)
	{
		// query and validate board id and access level
		$boardData = self::GetBoardData($request["board_id"], self::USERTYPE_None);

		if ($boardData["user_type"] < self::USERTYPE_Guest) 
		{
			http_response_code(400);
			exit("The user is already allowed to view this board!");
		}

		DB::setParam("user_id", $_SESSION["user_id"]);
		DB::setParam("board_id", $request["board_id"]);
		DB::setParam("user_type", self::USERTYPE_Guest);

		// add new permission or update existing one
		if ($boardData["user_type"] == self::USERTYPE_None)
			$guestPermissionQuery = "INSERT INTO tarallo_permissions (user_id, board_id, user_type) VALUES (:user_id, :board_id, :user_type)";	
		else 
			$guestPermissionQuery = "UPDATE tarallo_permissions SET user_type = :user_type WHERE user_id = :user_id AND board_id = :board_id";	

		DB::query($guestPermissionQuery);

		// prepare the response
		$response = array();
		$response["access_requested"] = true;
		return $response;
	}

	private static function UpdateBoardLabelsInternal($boardID, $labelNames, $labelColors)
	{
		$labelsString = implode(",", $labelNames);
		$labelColorsString = implode(",", $labelColors);
		DB::setParam("label_names", $labelsString);
		DB::setParam("label_colors", $labelColorsString);
		DB::setParam("board_id", $boardID);
		DB::query("UPDATE tarallo_boards SET label_names = :label_names, label_colors = :label_colors WHERE id = :board_id");
	}
	
	private static function DeleteAttachmentFiles($attachmentRecord)
	{
		$attachmentPath = self::GetAttachmentFilePathFromRecord($attachmentRecord);
		Utils::DeleteFile($attachmentPath);
		$thumbnailPath = self::GetThumbnailFilePathFromRecord($attachmentRecord);
		Utils::DeleteFile($thumbnailPath);
	}

	private static function DeleteCardInternal($boardID, $cardID, $deleteAttachments = true)
	{
		// query the card data
		$cardQuery = "SELECT * FROM tarallo_cards WHERE id = :id";
		DB::setParam("id", $cardID);
		$cardRecord = DB::fetch_row($cardQuery);

		if (!$cardRecord)
		{
			http_response_code(404);
			exit("Card not found.");
		}

		if ($cardRecord["board_id"] != $boardID)
		{
			http_response_code(400);
			exit("The specified card is not in the current board.");
		}

		// delete the card
		try
		{
			DB::beginTransaction();

			// re-link the previous card
			if ($cardRecord["prev_card_id"] > 0)
			{
				$prevCardLinkQuery = "UPDATE tarallo_cards SET next_card_id = :next_card_id WHERE id = :prev_card_id";
				DB::setParam("prev_card_id", $cardRecord["prev_card_id"]);
				DB::setParam("next_card_id", $cardRecord["next_card_id"]);
				DB::query($prevCardLinkQuery);
			}

			// re-link the next card
			if ($cardRecord["next_card_id"] > 0)
			{
				$nextCardLinkQuery = "UPDATE tarallo_cards SET prev_card_id = :prev_card_id WHERE id = :next_card_id";
				DB::setParam("prev_card_id", $cardRecord["prev_card_id"]);
				DB::setParam("next_card_id", $cardRecord["next_card_id"]);
				DB::query($nextCardLinkQuery);
			}

			// delete the card
			$deletionQuery = "DELETE FROM tarallo_cards WHERE id = :id";
			DB::setParam("id", $cardID);
			DB::query($deletionQuery);

			// delete attachments
			if ($deleteAttachments) 
			{
				// delete attachments files
				$attachmentsQuery = "SELECT * FROM tarallo_attachments WHERE card_id = :id";
				DB::setParam("id", $cardID);
				$attachments = DB::fetch_table($attachmentsQuery);
				$attachmentCount = count($attachments);
				for ($i = 0; $i < $attachmentCount; $i++) 
				{
					self::DeleteAttachmentFiles($attachments[$i]);
				}

				// delete attachments entries from db
				$deletionQuery = "DELETE FROM tarallo_attachments WHERE card_id = :id";
				DB::setParam("id", $cardID);
				DB::query($deletionQuery);
			}

			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}

		return $cardRecord;
	}

	private static function AddNewCardInternal($boardID, $cardlistID, $prevCardID, $title, $content, $coverAttachmentID, $lastMovedTime, $labelMask, $flagMask) 
	{
		// count the card in the destination cardlist
		$cardCountQuery = "SELECT COUNT(*) FROM tarallo_cards WHERE cardlist_id = :cardlist_id";
		DB::setParam("cardlist_id", $cardlistID);
		$cardCount = DB::query_one_result($cardCountQuery);

		if ($cardCount == 0 && $prevCardID > 0)
		{
			http_response_code(400);
			exit("The specified previous card is not in the destination cardlist.");
		}

		$nextCardID = 0;
		if ($cardCount > 0)
		{
			// cardlist is not empty

    		// query the card that will be the next after the new one
			$nextCardQuery = "SELECT * FROM tarallo_cards WHERE cardlist_id = :cardlist_id AND prev_card_id = :prev_card_id";
			DB::setParam("cardlist_id", $cardlistID);
			DB::setParam("prev_card_id", $prevCardID);
			$nextCardData = DB::fetch_row($nextCardQuery);

			// query prev card data
			$preCardData = false;
			if ($prevCardID > 0)
			{
				$prevCardQuery = "SELECT * FROM tarallo_cards WHERE cardlist_id = :cardlist_id AND id = :prev_card_id";
				DB::setParam("cardlist_id", $cardlistID);
				DB::setParam("prev_card_id", $prevCardID);
				$prevCardData = DB::fetch_row($prevCardQuery);

				if (!$prevCardData)
				{
					http_response_code(400);
					exit("The specified previous card id is invalid.");
				}
			}

			if ($nextCardData)
			{
				// found a card that will be next to the one that will be added
				$nextCardID = $nextCardData["id"];
			}
		}

		// perform queries to add the new cards and update the others
		try
		{
			DB::beginTransaction();

			// add a new card before the first, with the specified title
			$addCardQuery = "INSERT INTO tarallo_cards (title, content, prev_card_id, next_card_id, cardlist_id, board_id, cover_attachment_id, last_moved_time, label_mask, flags)";
			$addCardQuery .= " VALUES (:title, :content, :prev_card_id, :next_card_id, :cardlist_id, :board_id, :cover_attachment_id, :last_moved_time, :label_mask, :flags)";
			DB::setParam("title", $title);
			DB::setParam("content", $content);
			DB::setParam("prev_card_id", $prevCardID);
			DB::setParam("next_card_id", $nextCardID);
			DB::setParam("cardlist_id", $cardlistID);
			DB::setParam("board_id", $boardID);
			DB::setParam("cover_attachment_id", $coverAttachmentID);
			DB::setParam("last_moved_time", $lastMovedTime);
			DB::setParam("label_mask", $labelMask);
			DB::setParam("flags", $flagMask);
			$newCardID = DB::query($addCardQuery, true);

			if ($nextCardID > 0)
			{
				// update the next card by linking it to the new one
				$linkCardQuery = "UPDATE tarallo_cards SET prev_card_id = :new_id WHERE id = :next_card_id";
				DB::setParam("new_id", $newCardID);
				DB::setParam("next_card_id", $nextCardID);
				DB::query($linkCardQuery);
			}

			if ($prevCardID > 0)
			{
				// update the prev card by linking it to the new one
				$linkCardQuery = "UPDATE tarallo_cards SET next_card_id = :new_id WHERE id = :prev_card_id";
				DB::setParam("new_id", $newCardID);
				DB::setParam("prev_card_id", $prevCardID);
				DB::query($linkCardQuery);
			}

			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}
		
		// re-query the added card and return its record
		$cardQuery = "SELECT * FROM tarallo_cards WHERE id = :id";
		DB::setParam("id", $newCardID);
		$cardRecord = DB::fetch_row($cardQuery);

		return $cardRecord;
	}

	private static function RemoveCardListFromLL($cardListData)
	{
		// re-link previous list
		if ($cardListData["prev_list_id"] > 0)
		{
			$prevCardLinkQuery = "UPDATE tarallo_cardlists SET next_list_id = :next_list_id WHERE id = :prev_list_id";
			DB::setParam("prev_list_id", $cardListData["prev_list_id"]);
			DB::setParam("next_list_id", $cardListData["next_list_id"]);
			DB::query($prevCardLinkQuery);
		}

		// re-link the next list
		if ($cardListData["next_list_id"] > 0)
		{
			$nextCardLinkQuery = "UPDATE tarallo_cardlists SET prev_list_id = :prev_list_id WHERE id = :next_list_id";
			DB::setParam("prev_list_id", $cardListData["prev_list_id"]);
			DB::setParam("next_list_id", $cardListData["next_list_id"]);
			DB::query($nextCardLinkQuery);
		}
	}

	private static function DeleteCardListInternal($cardListData)
	{
		// delete the list
		try
		{
			DB::beginTransaction();

			self::RemoveCardListFromLL($cardListData);

			// delete the list
			$deletionQuery = "DELETE FROM tarallo_cardlists WHERE id = :id";
			DB::setParam("id", $cardListData["id"]);
			DB::query($deletionQuery);

			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}

		return $cardListData;
	}

	private static function AddCardListToLL($newListID, $prevListID, $nextListID)
	{
		if ($nextListID > 0)
		{
			// update the next card list by linking it to the new one
			DB::setParam("new_id", $newListID);
			DB::setParam("next_list_id", $nextListID);
			DB::query("UPDATE tarallo_cardlists SET prev_list_id = :new_id WHERE id = :next_list_id");
		}

		if ($prevListID > 0)
		{
			// update the prev card by linking it to the new one
			DB::setParam("new_id", $newListID);
			DB::setParam("prev_list_id", $prevListID);
			DB::query("UPDATE tarallo_cardlists SET next_list_id = :new_id WHERE id = :prev_list_id");
		}
	}

	private static function AddNewCardListInternal($boardID, $prevListID, $name) 
	{
		// count the cardlists in the destination board
		$cardListCountQuery = "SELECT COUNT(*) FROM tarallo_cardlists WHERE board_id = :board_id";
		DB::setParam("board_id", $boardID);
		$cardListCount = DB::query_one_result($cardListCountQuery);

		if ($cardListCount == 0 && $prevListID > 0)
		{
			http_response_code(400);
			exit("The specified previous card list is not in the destination board.");
		}

		$nextListID = 0;
		if ($cardListCount > 0)
		{
			// board is not empty

    		// query the cardlist that will be the next after the new one
			$nextCardListQuery = "SELECT * FROM tarallo_cardlists WHERE board_id = :board_id AND prev_list_id = :prev_list_id";
			DB::setParam("board_id", $boardID);
			DB::setParam("prev_list_id", $prevListID);
			$nextCardListRecord = DB::fetch_row($nextCardListQuery);

			// query prev card list data
			$preCardListRecord = false;
			if ($prevListID > 0)
			{
				$prevCardListQuery = "SELECT * FROM tarallo_cardlists WHERE board_id = :board_id AND id = :prev_list_id";
				DB::setParam("board_id", $boardID);
				DB::setParam("prev_list_id", $prevListID);
				$prevCardListRecord = DB::fetch_row($prevCardListQuery);

				if (!$prevCardListRecord)
				{
					http_response_code(400);
					exit("The specified previous card list id is invalid.");
				}
			}

			if ($nextCardListRecord)
			{
				// found a list that will be next to the one that will be added
				$nextListID = $nextCardListRecord["id"];
			}
		}

		// perform queries to add the new list and update the others
		try
		{
			DB::beginTransaction();

			// add the new list with the specified name
			$addCardListQuery = "INSERT INTO tarallo_cardlists (board_id, name, prev_list_id, next_list_id)";
			$addCardListQuery .= " VALUES (:board_id, :name, :prev_list_id, :next_list_id)";
			DB::setParam("board_id", $boardID);
			DB::setParam("name", $name);
			DB::setParam("prev_list_id", $prevListID);
			DB::setParam("next_list_id", $nextListID);
			$newListID = DB::query($addCardListQuery, true);

			self::AddCardListToLL($newListID, $prevListID, $nextListID);

			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}
		
		// re-query the added list and return its data
		return self::GetCardlistData($boardID, $newListID);
	}

	private static function CreateNewBoardInternal($title)
	{
		try
		{
			DB::beginTransaction();
		
			// create a new board record
			$createBoardQuery = "INSERT INTO tarallo_boards (title, label_names, label_colors, last_modified_time)";
			$createBoardQuery .= " VALUES (:title, :label_names, :label_colors, :last_modified_time)";
			DB::setParam("title", self::CleanBoardTitle($title));
			DB::setParam("label_names", "");
			DB::setParam("label_colors", "");
			DB::setParam("last_modified_time", time());
			$newBoardID = DB::query($createBoardQuery, true);

			// create the owner permission record
			$createBoardQuery = "INSERT INTO tarallo_permissions (user_id, board_id, user_type)";
			$createBoardQuery .= " VALUES (:user_id, :board_id, :user_type)";
			DB::setParam("user_id", $_SESSION["user_id"]);
			DB::setParam("board_id", $newBoardID);
			DB::setParam("user_type", self::USERTYPE_Owner);
			DB::query($createBoardQuery);
		
			DB::commit();
		}
		catch(Exception $e)
		{
			DB::rollBack();
			throw $e;
		}

		return $newBoardID;
	}

	private static function CardRecordToData($cardRecord)
	{	
		$card = array();
		$card["title"] = $cardRecord["title"];
		$card["cardlist_id"] = $cardRecord["cardlist_id"];
		$card["id"] = $cardRecord["id"];
		$card["prev_card_id"] = $cardRecord["prev_card_id"];
		$card["next_card_id"] = $cardRecord["next_card_id"];
		$card["cover_img_url"] = "";
		if ($cardRecord["cover_attachment_id"] > 0)
		{
			$card["cover_img_url"] = self::GetThumbnailProxyUrl($cardRecord["board_id"], $cardRecord["cover_attachment_id"]);
		}
		$card["label_mask"] = $cardRecord["label_mask"];
		if ($cardRecord["last_moved_time"] != 0) 
		{
			$card["last_moved_date"] = date("d M Y", $cardRecord["last_moved_time"]);
		}
		$card = array_merge($card, self::CardFlagMaskToList($cardRecord["flags"]));
		return $card;
	}

	private static function CardFlagMaskToList($flagMask)
	{
		$flagList = array();
		$flagList["locked"] = $flagMask & 0x001;
		return $flagList;
	}

	private static function CardFlagListToMask($flagList)
	{
		$flagMask = 0;
		$flagMask += $flagList["locked"] ? 1 : 0;
		return $flagMask;
	}

	private static function AttachmentRecordToData($attachmentRecord)
	{
		$attachmentData = array();
		$attachmentData["id"] = $attachmentRecord["id"];
		$attachmentData["name"] = $attachmentRecord["name"];
		$attachmentData["extension"] = $attachmentRecord["extension"];
		$attachmentData["card_id"] = $attachmentRecord["card_id"];
		$attachmentData["board_id"] = $attachmentRecord["board_id"];
		$attachmentData["url"] = self::GetAttachmentProxyUrlFromRecord($attachmentRecord);
		$attachmentData["thumbnail"] = self::GetThumbnailProxyUrlFromRecord($attachmentRecord);
		return $attachmentData;
	}

	private static function BoardRecordToData($boardRecord)
	{
		$boardData = array();
		$boardData["id"] = $boardRecord["id"];
		$boardData["user_type"] = $boardRecord["user_type"];
		$boardData["title"] = $boardRecord["title"];
		$boardData["closed"] = $boardRecord["closed"];
		$boardData["background_url"] = self::GetBackgroundUrl($boardRecord["id"], $boardRecord["background_guid"]);
		$boardData["background_thumb_url"] = self::GetBackgroundUrl($boardRecord["id"], $boardRecord["background_guid"], true);
		$boardData["background_tiled"] = $boardRecord["background_guid"] ? false : true; // only the default bg is tiled for now
		$boardData["label_names"] = $boardRecord["label_names"];
		$boardData["label_colors"] = $boardRecord["label_colors"];
		$boardData["all_color_names"] = self::DEFAULT_LABEL_COLORS;
		return $boardData;
	}

	private static function GetBoardData($boardID, $maxUserType = self::USERTYPE_Owner)
	{
		$userID = $_SESSION["user_id"];

		// query board data
		$boardQuery = "SELECT tarallo_boards.*, tarallo_permissions.user_type";
		$boardQuery .= " FROM tarallo_boards INNER JOIN tarallo_permissions ON tarallo_boards.id = tarallo_permissions.board_id";
		$boardQuery .= " WHERE tarallo_boards.id = :board_id AND user_id = :user_id";
		DB::setParam("board_id", $boardID);
		DB::setParam("user_id", $userID);
		$boardRecord = DB::fetch_row($boardQuery);

		if (!$boardRecord)
		{
			// the specified board_id does not exists, or the current user do not have access to it
			DB::setParam("board_id", $boardID);
			$boardRecord = DB::fetch_row("SELECT * FROM tarallo_boards WHERE tarallo_boards.id = :board_id");

			if (!$boardRecord)
			{
				http_response_code(404);
				exit("The specified board_id does not exists.");
			}

			// use blocked as "no permission record available"
			$boardRecord["user_type"] = self::USERTYPE_None;
		}

		self::CheckPermissions($boardRecord["user_type"], $maxUserType);

		return self::BoardRecordToData($boardRecord);
	}

	private static function UpdateBoardModifiedTime($boardID)
	{
		DB::setParam("last_modified_time", time());
		DB::setParam("board_id", $boardID);
		DB::query("UPDATE tarallo_boards SET last_modified_time = :last_modified_time WHERE id = :board_id");
	}

	private static function CheckPermissions($userType, $requestedUserType) 
	{
		if ($userType > $requestedUserType)
		{
			http_response_code(403);
			exit("Missing permissions to perform the requested operation.");
		}
	}

	private static function GetCardlistData($boardID, $cardlistID)
	{
		// query and validate cardlist
		$cardlistQuery = "SELECT * FROM tarallo_cardlists WHERE id = :cardlist_id";
		DB::setParam("cardlist_id", $cardlistID);
		$cardlistData = DB::fetch_row($cardlistQuery);

		if (!$cardlistData)
		{
			http_response_code(404);
			exit("The specified list does not exists.");
		}

		if ($cardlistData["board_id"] != $boardID)
		{
			http_response_code(400);
			exit("The specified list is not part of the specified board.");
		}

		return $cardlistData;
	}

	private static function GetCardData($boardID, $cardID)
	{
		// query and validate cardlist
		$cardQuery = "SELECT * FROM tarallo_cards WHERE id = :card_id";
		DB::setParam("card_id", $cardID);
		$cardData = DB::fetch_row($cardQuery);

		if (!$cardData)
		{
			http_response_code(404);
			exit("The specified card does not exists.");
		}

		if ($cardData["board_id"] != $boardID)
		{
			http_response_code(400);
			exit("The card is not part of the specified board.");
		}

		return $cardData;
	}

	private static function GetAttachmentRecord($boardID, $attachmentID)
	{
		// query attachment
		DB::setParam("id", $attachmentID);
		$attachmentRecord = DB::fetch_row("SELECT * FROM tarallo_attachments WHERE id = :id");

		if (!$attachmentRecord)
		{
			http_response_code(404);
			exit("Attachment not found.");
		}

		if ($attachmentRecord["board_id"] != $boardID)
		{
			http_response_code(403);
			exit("Cannot modify attachments from other boards.");
		}

		return $attachmentRecord;
	}

	private static function GetBoardContentDir($boardID)
	{
		return "boards/$boardID/";
	}

	private static function GetAttachmentDir($boardID)
	{
		return self::GetBoardContentDir($boardID) . "a/";
	}

	private static function GetAttachmentFilePath($boardID, $guid, $extension)
	{
		return self::GetAttachmentDir($boardID) . $guid . "." . $extension;
	}

	private static function GetAttachmentFilePathFromRecord($record)
	{
		return self::GetAttachmentFilePath($record["board_id"], $record["guid"], $record["extension"]);
	}

	private static function GetAttachmentProxyUrl($boardID, $attachmentID)
	{
		return "php/api.php?OP=ProxyAttachment&board_id=$boardID&id=$attachmentID";
	}

	private static function GetAttachmentProxyUrlFromRecord($record)
	{
		return self::GetAttachmentProxyUrl($record["board_id"], $record["id"]);
	}

	private static function GetBackgroundUrl($boardID, $guid, $thumbnail = false)
	{
		if ($guid) 
		{
			$guidElems = explode("#", $guid);
			return self::GetBoardContentDir($boardID) . $guidElems[0] . ($thumbnail ? "-thumb." : ".") . $guidElems[1];
		}
		else
		{
			return $thumbnail ? self::DEFAULT_BOARDTILE_BG : self::DEFAULT_BG;
		}
	}

	private static function GetThumbnailDir($boardID)
	{
		return self::GetAttachmentDir($boardID) . "t/";
	}

	private static function GetThumbnailFilePath($boardID, $guid)
	{
		return self::GetThumbnailDir($boardID) . $guid . ".jpg";
	}

	private static function GetThumbnailFilePathFromRecord($record)
	{
		return self::GetThumbnailFilePath($record["board_id"], $record["guid"]);
	}

	private static function GetThumbnailProxyUrl($boardID, $attachmentID)
	{
		return self::GetAttachmentProxyUrl($boardID, $attachmentID) . "&thumbnail=true";
	}

	private static function GetThumbnailProxyUrlFromRecord($record)
	{
		switch ($record["extension"])
		{
			case "jpg":
			case "jpeg":
			case "png":
			case "gif":
				return self::GetThumbnailProxyUrl($record["board_id"], $record["id"]);
		}	
		return false;
	}

	private static function IsUserLoggedIn()
	{
		return isset($_SESSION["user_id"]);
	}

	private static function LogoutInternal()
	{
		session_destroy();
	}

	private static function CleanBoardTitle($title)
	{
		return substr($title, 0, 64);
	}

	private static function CleanAttachmentName($name)
	{
		return substr($name, 0, 100);
	}

	private static function CleanLabelName($name)
	{
		$name = str_replace(',', ' ', $name);
		return substr($name, 0, 32);
	}

	private static function CompareTrelloSortedItems($a, $b)
	{
		if ($a["pos"] == $b["pos"])
			return 0;
		
		return ($a["pos"] < $b["pos"]) ? -1 : 1;
	}

	private static function GetDBSetting($name)
	{
		DB::setParam("name", $name);
		return DB::query_one_result("SELECT value FROM tarallo_settings WHERE name = :name");
	}
}

?>