<?php
	class DB {

		private static $db = NULL;
		private static $transactionNesting = 0;
		private static $transactionFailed = false;

		//Open a new connection to a database.
		public static function open()
		{
			global $CFG;

			if (is_null(self::$db))
			{
				$opt = array(
					PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
					PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
					PDO::ATTR_EMULATE_PREPARES   => false,
				);
				try {
					self::$db = new PDO($CFG["DB_DSN"], $CFG["DB_USERNAME"], $CFG["DB_PASSWORD"], $opt);
				} catch (PDOException $e) {
					http_response_code(500);
					exit("DB Connection Error.");
				}	
			}
			return self::$db;
		}

		// Open a DB transaction, can be nested
		public static function beginTransaction()
		{
			if (self::$transactionNesting == 0)
			{
				$db = self::open();
				$db->beginTransaction();
				self::$transactionFailed = false;
			}
			self::$transactionNesting++;
		}

		// Commit a DB transaction, only actually commit on the outer nesting level.
		// If any of the inner levels did a rollback, this will have no effect and actually rollback on the outer level.
		public static function commit()
		{
			if (self::$transactionNesting > 0)
			{
				self::$transactionNesting--;
				if (self::$transactionNesting == 0)
				{
					$db = self::open();
					if (self::$transactionFailed)
						$db->rollback();
					else	
						$db->commit();
				}
			}
		}

		// Rollback a DB transaction, if nested, subsequent transaction calls are discarded and a rollback is perfomed in the outer termination
		// (even if the outer level terminated with a commit)
		public static function rollBack()
		{
			$db = self::open();
			if (self::$transactionNesting > 0)
			{
				self::$transactionNesting--;
				self::$transactionFailed = true;

				if (self::$transactionNesting == 0)
					$db->rollBack();
			}
		}
		
		//Set parameters for the next query.
		public static $qparams = array ();
		public static function setParam($name, $value)
		{
			self::$qparams[$name] = $value;
		}
		
		//Execute a query and return the result.
		//	$query: the query string
		public static function query($query, $getLastID = false)
		{
			$params = self::$qparams;
			self::$qparams = array();
			$db = self::open();
			$db->query('SET NAMES utf8');
			$result = $db->prepare($query);	
			$result->execute($params);
			
			if($getLastID && $result) {
				$result = $db->lastInsertId();
			}
	
			return $result;
		}

		//Execute a query and return the number of affected rows.
		//Parameters are not supported, but mupliple queries can be passed, separated by a semi-column.
		//	$query: the query string
		public static function exec($query)
		{
			$db = self::open();
			$db->query('SET NAMES utf8');
			$result = $db->exec($query);	
			return $result;
		}
		
		//Execute a query and return only one element (first row, first column).
		//	$query: the query string
		public static function query_one_result($query)
		{
			$result = self::query($query);
			if(!$result) return false;
			$row = $result->fetch(PDO::FETCH_NUM);
			$value = $row[0];
			return $value;
		}
		
		//Execute a query and return the result as a dictionary.
		//	$query: the query string
		//	$keyName: the name of the field to be used as the dictionary key
		public static function fetch_dictionary($query, $keyName)
		{
			$result = self::query($query);
			if(!$result) return false;
			$dictionary = array();			
			while($row = $result->fetch())
			{
				$dictionary[$row[$keyName]] = $row;
			}
			return $dictionary;
		}
		
		//Execute a query and return the result as a dictionary.
		//	$query: the query string
		//	$keyName: the name of the field to be used as the dictionary key
		//	$valueName: the name of the field to be used as the dictionary value
		public static function fetch_assoc($query, $keyName, $valueName)
		{
			$result = self::query($query);
			if(!$result) return false;
			$dictionary = array();			
			while($row = $result->fetch())
			{
				$dictionary[$row[$keyName]] = $row[$valueName];
			}
			return $dictionary;
		}
		
		//Execute a query and return the result as an array of rows.
		//	$query: the query string
		public static function fetch_table($query)
		{
			$result = self::query($query);
			if(!$result) return false;
			$table = array();			
			while($row = $result->fetch())
			{
				$table[] = $row;
			}
			return $table;
		}
		
		//Execute a query and return the first row as an associative array.
		//	$query: the query string
		public static function fetch_row($query)
		{
			$result = self::query($query);		
			if(!$result) return false;
			return $result->fetch();
		}
		
		//Execute a query and return the result as an array selecting only one column.
		//	$query: the query string
		//	$fieldName: the name of the field to be selected
		public static function fetch_array($query, $fieldName) {
			$result = self::query($query);
			if(!$result) return false;
			$varray = array();			
			while($row = $result->fetch())
			{
				$varray[] = $row[$fieldName];
			}
			return $varray;
		}
		
		
		//Generates and returns a query that selects all the values contained in the specifield table fields.
		//	$fields: an array of strings that represents the fields in the format: <table name>.<field name>
		public static function create_set_query($fields)
		{
			$query = '';
			for($i = 0; $i < count($fields); $i++)
			{		
				$query = $query . ($i > 0 ? ' UNION' : '');
				$f = explode('.', $fields[$i]);
				$query = $query 
					. ' SELECT DISTINCT ' . $f[1] . ' AS id'
					. ' FROM ' . $f[0] 
					. ' WHERE ' . $f[1] . ' IS NOT NULL'; 
			}
			return $query;
		}
	}
	
?>