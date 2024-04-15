<?php

define('CONFIG_FILE', 1);

// ====== SERVER CONFIGURATION ================

$CFG = array();
// Define the Tarallo root folder location for file operations.
$CFG["FTP_ROOT"] = dirname(__DIR__);
// DB connection string
$CFG["DB_DSN"] = 'mysql:host=mysql;port=3306;dbname=tarallo;charset=utf8';
// DB username 
$CFG["DB_USERNAME"] = '';
// DB password
$CFG["DB_PASSWORD"] = '';

// ===========================================

// config overrides from environment
if (getenv('TARALLO_FTP_ROOT'))
	$CFG["FTP_ROOT"] = getenv('TARALLO_FTP_ROOT'); 
if (getenv('TARALLO_DB_DSN'))
	$CFG["DB_DSN"] = getenv('TARALLO_DB_DSN');
if (getenv('TARALLO_DB_USERNAME'))
	$CFG["DB_USERNAME"] = getenv('TARALLO_DB_USERNAME');
if (getenv('TARALLO_DB_PASSWORD'))
	$CFG["DB_PASSWORD"] = getenv('TARALLO_DB_PASSWORD'); 

// Returns the correct absolute ftp path from a path relative to the app folder.
// usage: ftpdir('my/relative/path.txt')
function FTPDir($relativePath) {
	global $CFG;
	$absPath = $relativePath;
	$absPath = $CFG["FTP_ROOT"] . '/' . $absPath;	
	return str_replace('//', '/', '/' . $absPath);
}

?>