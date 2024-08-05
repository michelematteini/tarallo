START TRANSACTION;

ALTER TABLE `tarallo_settings` 
	CHANGE `value` `value` VARCHAR(512) NOT NULL; 

INSERT INTO `tarallo_settings` (`id`, `name`, `value`, `client_access`) VALUES 
(4, 'instance_msg', '', 1); 

UPDATE `tarallo_settings`
  SET `value` = '1-3' 
  WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;