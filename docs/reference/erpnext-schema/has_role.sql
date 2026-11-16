CREATE TABLE `tabHas Role` (
  `name` varchar(140) NOT NULL,
  `creation` datetime(6) DEFAULT NULL,
  `modified` datetime(6) DEFAULT NULL,
  `modified_by` varchar(140) DEFAULT NULL,
  `owner` varchar(140) DEFAULT NULL,
  `docstatus` int(1) NOT NULL DEFAULT 0,
  `idx` int(8) NOT NULL DEFAULT 0,
  `role` varchar(140) DEFAULT NULL,
  `parent` varchar(140) DEFAULT NULL,
  `parentfield` varchar(140) DEFAULT NULL,
  `parenttype` varchar(140) DEFAULT NULL,
  PRIMARY KEY (`name`),
  KEY `parent` (`parent`),
  KEY `modified` (`modified`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
