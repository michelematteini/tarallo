<?php

define('CONFIG_FILE', 1);

/**
  * =============== DB Settings =======================================
  */
  
define('DB_DSN', 'mysql: host=ftp.trytarallo.altervista.org;dbname=my_trytarallo;charset=utf8');
define('DB_USERNAME', '');
define('DB_PASSWORD', '');

/**
  * =============== FTP Settings ======================================
  */

/**
  * Define the Tarallo root folder location for file operations.
  * Comment this line if Tarallo is located in the ftp root.
  */
define('FTP_ROOT', '/membri/trytarallo');

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