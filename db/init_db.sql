SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- --------------------------------------------------------

--
-- Table structure for table `tarallo_attachments`
--

CREATE TABLE `tarallo_attachments` (
  `id` int NOT NULL,
  `name` varchar(100) NOT NULL,
  `guid` varchar(64) NOT NULL,
  `extension` varchar(10) NOT NULL,
  `card_id` int NOT NULL,
  `board_id` int NOT NULL
);

-- --------------------------------------------------------

--
-- Table structure for table `tarallo_boards`
--

CREATE TABLE `tarallo_boards` (
  `id` int NOT NULL,
  `title` varchar(64) NOT NULL,
  `closed` int NOT NULL DEFAULT '0',
  `background_guid` varchar(64) DEFAULT NULL,
  `label_names` varchar(600) NOT NULL,
  `label_colors` varchar(600) NOT NULL,
  `last_modified_time` bigint NOT NULL 
);

-- --------------------------------------------------------

--
-- Table structure for table `tarallo_cardlists`
--

CREATE TABLE `tarallo_cardlists` (
  `id` int NOT NULL,
  `board_id` int NOT NULL COMMENT 'id of the board in which this list is displayed',
  `name` varchar(50) NOT NULL DEFAULT 'new list',
  `prev_list_id` int NOT NULL DEFAULT '0',
  `next_list_id` int NOT NULL DEFAULT '0'
);

-- --------------------------------------------------------

--
-- Table structure for table `tarallo_cards`
--

CREATE TABLE `tarallo_cards` (
  `id` int NOT NULL,
  `title` text NOT NULL,
  `content` text NOT NULL,
  `prev_card_id` int NOT NULL,
  `next_card_id` int NOT NULL,
  `cardlist_id` int NOT NULL COMMENT 'id of the card list in which this card is listed',
  `board_id` int NOT NULL COMMENT 'id of the board in which this card is located',
  `cover_attachment_id` int NOT NULL DEFAULT '0',
  `last_moved_time` bigint NOT NULL,
  `label_mask` int NOT NULL,
  `flags` int NOT NULL
);

-- --------------------------------------------------------

--
-- Table structure for table `tarallo_permissions`
--

CREATE TABLE `tarallo_permissions` (
  `id` int NOT NULL,
  `user_id` int NOT NULL,
  `board_id` int NOT NULL,
  `user_type` int NOT NULL
);

-- --------------------------------------------------------

--
-- Table structure for table `tarallo_users`
--

CREATE TABLE `tarallo_users` (
  `id` int NOT NULL,
  `username` varchar(30) NOT NULL,
  `password` varchar(255) DEFAULT NULL,
  `display_name` varchar(30) NOT NULL,
  `register_time` bigint NOT NULL,
  `last_access_time` bigint NOT NULL
);

--
-- Table structure for table `tarallo_settings`
--

CREATE TABLE `tarallo_settings` (
  `id` int NOT NULL,
  `name` varchar(32) NOT NULL,
  `value` varchar(512) NOT NULL
);

--
-- Dumping data for table `tarallo_settings`
--

INSERT INTO `tarallo_settings` (`id`, `name`, `value`) VALUES
(1, 'db_version', '4'),
(2, 'registration_enabled', '1'),
(3, 'attachment_max_size_kb', '2048'),
(4, 'instance_msg', ''),
(5, 'board_export_enabled', '1'), 
(6, 'board_import_enabled', '1'), 
(7, 'trello_import_enabled', '1');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `tarallo_attachments`
--
ALTER TABLE `tarallo_attachments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tarallo_boards`
--
ALTER TABLE `tarallo_boards`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tarallo_cardlists`
--
ALTER TABLE `tarallo_cardlists`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tarallo_cards`
--
ALTER TABLE `tarallo_cards`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `tarallo_permissions`
--
ALTER TABLE `tarallo_permissions`
  ADD UNIQUE KEY `id` (`id`),
  ADD KEY `user_and_board` (`user_id`,`board_id`);

--
-- Indexes for table `tarallo_users`
--
ALTER TABLE `tarallo_users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- Indexes for table `tarallo_settings`
--
ALTER TABLE `tarallo_settings`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `tarallo_attachments`
--
ALTER TABLE `tarallo_attachments`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tarallo_boards`
--
ALTER TABLE `tarallo_boards`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tarallo_cardlists`
--
ALTER TABLE `tarallo_cardlists`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tarallo_cards`
--
ALTER TABLE `tarallo_cards`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tarallo_permissions`
--
ALTER TABLE `tarallo_permissions`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tarallo_users`
--
ALTER TABLE `tarallo_users`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
COMMIT;

--
-- AUTO_INCREMENT for table `tarallo_settings`
--
ALTER TABLE `tarallo_settings`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
