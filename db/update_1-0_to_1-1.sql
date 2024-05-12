START TRANSACTION;

ALTER TABLE `tarallo_boards` 
  ADD `last_modified_time` BIGINT NOT NULL; 

UPDATE `tarallo_settings`
  SET `value` = '1-1' 
  WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;