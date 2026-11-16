CREATE TABLE `tabPayment Terms Template` (
  `name` varchar(140) NOT NULL,
  `creation` datetime(6) DEFAULT NULL,
  `modified` datetime(6) DEFAULT NULL,
  `modified_by` varchar(140) DEFAULT NULL,
  `owner` varchar(140) DEFAULT NULL,
  `docstatus` int(1) NOT NULL DEFAULT 0,
  `idx` int(8) NOT NULL DEFAULT 0,
  `template_name` varchar(140) DEFAULT NULL,
  `allocate_payment_based_on_payment_terms` int(1) NOT NULL DEFAULT 0,
  `_user_tags` text DEFAULT NULL,
  `_comments` text DEFAULT NULL,
  `_assign` text DEFAULT NULL,
  `_liked_by` text DEFAULT NULL,
  PRIMARY KEY (`name`),
  UNIQUE KEY `template_name` (`template_name`),
  KEY `modified` (`modified`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
