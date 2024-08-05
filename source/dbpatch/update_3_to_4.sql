START TRANSACTION;

ALTER TABLE `tarallo_settings` 
	DROP `client_access`;

INSERT INTO `tarallo_settings` (`id`, `name`, `value`) VALUES 
(NULL, 'board_export_enabled', '1'), 
(NULL, 'board_import_enabled', '1'), 
(NULL, 'trello_import_enabled', '1');

ALTER TABLE `tarallo_boards` 
	CHANGE `label_names` `label_names` VARCHAR(600) NOT NULL, 
	CHANGE `label_colors` `label_colors` VARCHAR(600) NOT NULL; 

UPDATE `tarallo_settings`
  SET `value` = '4' 
  WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;