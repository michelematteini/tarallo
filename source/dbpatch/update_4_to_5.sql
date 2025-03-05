START TRANSACTION;

ALTER TABLE `tarallo_users` 
	ADD `is_admin` INT NOT NULL DEFAULT 0;

INSERT INTO `tarallo_settings` (`id`, `name`, `value`) VALUES
	(NULL, 'perform_first_startup', '1');

UPDATE `tarallo_settings`
	SET `value` = '5' 
	WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;