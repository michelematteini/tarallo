START TRANSACTION;

UPDATE `tarallo_cards`
	SET `content` = ''
    WHERE `content`= 'Insert the card description here.';

UPDATE `tarallo_settings`
	SET `value` = '6' 
	WHERE `tarallo_settings`.`name` = 'db_version'; 

COMMIT;