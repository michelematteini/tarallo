START TRANSACTION;

ALTER TABLE `tarallo_cards` 
	ADD `flags` INT NOT NULL;

UPDATE `tarallo_settings`
  SET `value` = '1-2' 
  WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;