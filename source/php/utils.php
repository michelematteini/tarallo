<?php

class Utils {
	public static function DecodePostJSON() {
		$inputJSON = file_get_contents('php://input');
		return json_decode($inputJSON, true); //convert JSON into an array
	}

    // create directories for the specified file path if these don't exist
    public static function PrepareDir($filePath)
    {
        $absDir = FTPDir(dirname($filePath));

        if (!is_dir($absDir) && !@mkdir($absDir, 0777, true))
        {
            exit(sprintf('Failed to create directory "%s". Please check permissions.', $absDir));
        }
    }

	public static function WriteToFile($filePath, $contents, $flags = 0) 
    {
        // create subdirectories that do not exists
        self::PrepareDir($filePath);

        // save content to file
        $absPath = FTPDir($filePath);
        return file_put_contents($absPath, $contents, $flags);
    }

    public static function ReadFileAsString($filePath)
    {
        $absDir = FTPDir($filePath);
        return file_get_contents($absDir);
    }

    public static function DeleteFile($filePath)
    {
        $absDir = FTPDir($filePath);
        unlink($absDir);
    }

    public static function DeleteDir($dirPath)
    {
        // remove trailing slash if any
        $lastCharIndex = strlen($dirPath) - 1;
        if ($dirPath[$lastCharIndex] == '\\' || $dirPath[$lastCharIndex] == '/')
            $dirPath = substr($dirPath, 0, $lastCharIndex);

        // calc absoluted path for ftp
        $absDir = FTPDir($dirPath);

        self::DeleteDirInternal($absDir);
    }

    private static function DeleteDirInternal($dirPath)
    {
        $fileNames = array_diff(scandir($dirPath), array('.','..'));

        // remove files recursively
        foreach ($fileNames as $fileName) 
        {
            $filePath = "$dirPath/$fileName";
            if (is_dir($filePath))
                self::DeleteDirInternal($filePath);
            else
                unlink($filePath);
        }

        // delete the top folder
        rmdir($dirPath);
    }

    public static function OutputFile($filePath, $contentType, $fileName, $isDownload = false)
    {
        $absFilePath = FTPDir($filePath);
        if (file_exists($absFilePath)) {
            header("Content-Type: $contentType");
            header('Content-Length: ' . filesize($absFilePath));
            $contentDisp = $isDownload ? "attachment" : "inline";
            header("Content-Disposition: {$contentDisp}; filename=\"{$fileName}\"");
            readfile($absFilePath);
            exit;
        }
        else {
            http_response_code(404);
            exit("File not found.");
        }
    }

    public static function FileExists($filePath)
    {
        $absFilePath = FTPDir($filePath);
        return file_exists($absFilePath);
    }

    public static function CreateImageThumbnail($srcImgPath, $destImgPath)
    {
        $srcAbsPath = FTPDir($srcImgPath);
        $srcInfo = getimagesize($srcAbsPath);

        // load the source image
        switch($srcInfo[2])
        {
            case IMAGETYPE_GIF:
                $srcImage = imagecreatefromgif($srcAbsPath);
                break;
            case IMAGETYPE_JPEG:
                $srcImage = imagecreatefromjpeg($srcAbsPath);
                break;
            case IMAGETYPE_PNG:
                $srcImage = imagecreatefrompng($srcAbsPath);
                break;
            default:
                // unsupported for thumbnail (or add another imagecreate case)
                return;
        }

        // create a smaller copy of the src image
        $destWidth = 256;
        $destHeight = floor($destWidth * $srcInfo[1] / $srcInfo[0]);
        $destImage = imagecreatetruecolor($destWidth, $destHeight);
        imagecopyresampled($destImage, $srcImage, 0, 0, 0, 0, $destWidth, $destHeight, $srcInfo[0], $srcInfo[1]);

        // save thumbnail as jpg
        $destAbsPath = FTPDir($destImgPath);
        $destAbsDir = dirname($destAbsPath);
        if(!is_dir($destAbsDir))
        {
            // create subdirectories that do not exists
            mkdir($destAbsDir, 0777, true);
        }
        imagejpeg($destImage, $destAbsPath);
    }

    // given a list of db row records, this function builds a mapping of the speicified id field from the current to a new value, 
    // starting from the given next free id
    public static function RebuildDBIndex($dbRows, $idFieldName, $nextFreeID)
    {
        $newIndex = array();
		$rowCount = count($dbRows);
		for ($i = 0; $i < $rowCount; $i++)
		{
			$newIndex[$dbRows[$i][$idFieldName]] = $nextFreeID++;
		}
		return $newIndex;
    }

    public const MimeTypes = array(
            'txt' => 'text/plain',
            'htm' => 'text/html',
            'html' => 'text/html',
            'php' => 'text/html',
            'css' => 'text/css',
            'js' => 'application/javascript',
            'json' => 'application/json',
            'xml' => 'application/xml',
            'swf' => 'application/x-shockwave-flash',
            'flv' => 'video/x-flv',

            // images
            'png' => 'image/png',
            'jpe' => 'image/jpeg',
            'jpeg' => 'image/jpeg',
            'jpg' => 'image/jpeg',
            'gif' => 'image/gif',
            'bmp' => 'image/bmp',
            'ico' => 'image/vnd.microsoft.icon',
            'tiff' => 'image/tiff',
            'tif' => 'image/tiff',
            'svg' => 'image/svg+xml',
            'svgz' => 'image/svg+xml',

            // archives
            'zip' => 'application/zip',
            'rar' => 'application/x-rar-compressed',
            'exe' => 'application/x-msdownload',
            'msi' => 'application/x-msdownload',
            'cab' => 'application/vnd.ms-cab-compressed',

            // audio/video
            'mp3' => 'audio/mpeg',
            'qt' => 'video/quicktime',
            'mov' => 'video/quicktime',

            // adobe
            'pdf' => 'application/pdf',
            'psd' => 'image/vnd.adobe.photoshop',
            'ai' => 'application/postscript',
            'eps' => 'application/postscript',
            'ps' => 'application/postscript',

            // ms office
            'doc' => 'application/msword',
            'rtf' => 'application/rtf',
            'xls' => 'application/vnd.ms-excel',
            'ppt' => 'application/vnd.ms-powerpoint',

            // open office
            'odt' => 'application/vnd.oasis.opendocument.text',
            'ods' => 'application/vnd.oasis.opendocument.spreadsheet',
        );
}

?>