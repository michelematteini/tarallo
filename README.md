# Tarallo
Minimalistic card-based TODO lists in Vanilla JS.
Build as an easy to host Trello alternative with no dependencies, only requiring PHP 7.
Compatible with any DBMS suported by PHP PDO (see https://www.php.net/manual/en/pdo.drivers.php).

## To host an instance:

### On an existing web server
1. copy the content of **source/** to your web server (sub-directories work fine)
2. modify **config.php** to setup the db connection string (**DB_DSN**) and an ftp path to the src folder  (**FTP_ROOT**) and optionally other parameters.
3. run db/init_db.sql on your DB

### Docker (currently not fully working see issue: https://github.com/michelematteini/tarallo/issues/3)
1. update variables (database password) in `.env` file
2. run `docker compose build` from project root
3. run `docker compose up -d`
4. access site via [http://localhost:8080](http://localhost:8080)

Additional settings can be found in the "tarallo_settings" DB table.

## To try it out
Just create an account here:
https://trytarallo.altervista.org
You will also be able to access a showcase board.
Mind the the above instance data will be wiped out periodically.
![Preview1](screenshots/preview2.JPG)
![Preview2](screenshots/preview3.JPG)
![Preview3](screenshots/preview1.JPG)
