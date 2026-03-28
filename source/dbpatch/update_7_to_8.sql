START TRANSACTION;

INSERT INTO `tarallo_settings` (`id`, `name`, `value`) VALUES
	(NULL, 'allow_public_access', '1');

UPDATE `tarallo_settings`
	SET `value` = '8' 
	WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;