START TRANSACTION;

ALTER TABLE `tarallo_cards`
	ADD `content_format` VARCHAR(8) NOT NULL DEFAULT 'TXT';

UPDATE `tarallo_settings`
	SET `value` = '7' 
	WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;