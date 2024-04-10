<?php

define('CONFIG_FILE', 1);

/**
  * =============== DB Settings =======================================
  */

define('DB_DSN', getenv('DB_DSN') ?? 'mysql:host=mysql;port=3306;dbname=tarallo;charset=utf8');
define('DB_USERNAME', getenv('DB_USERNAME') ?? 'tarallo');
define('DB_PASSWORD', getenv('DB_PASSWORD') ?? '');

/**
  * =============== FTP Settings ======================================
  */

/**
  * Define the Tarallo root folder location for file operations.
  * Uncomment this line if Tarallo is not located in the ftp root.
  */
// define('FTP_ROOT', '/membri/trytarallo');

/*
 * Return the correct absolute relative ftp path from a path relative to the app folder.
 * usage: ftpdir('/my/absolute/path.txt')
 */
function FTPDir($relativePath) {
	$absPath = $relativePath;
	if (defined('FTP_ROOT')) {
		$absPath = FTP_ROOT . '/' . $absPath;
	}
	return str_replace('//', '/', '/' . $absPath);
}

?>