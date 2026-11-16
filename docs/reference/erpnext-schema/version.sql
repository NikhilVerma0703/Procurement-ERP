CREATE TABLE `tabVersion` (
  `name` bigint(20) NOT NULL,
  `creation` datetime(6) DEFAULT NULL,
  `modified` datetime(6) DEFAULT NULL,
  `modified_by` varchar(140) DEFAULT NULL,
  `owner` varchar(140) DEFAULT NULL,
  `docstatus` int(1) NOT NULL DEFAULT 0,
  `idx` int(8) NOT NULL DEFAULT 0,
  `ref_doctype` varchar(140) DEFAULT NULL,
  `docname` varchar(140) DEFAULT NULL,
  `data` longtext DEFAULT NULL,
  `_user_tags` text DEFAULT NULL,
  `_comments` text DEFAULT NULL,
  `_assign` text DEFAULT NULL,
  `_liked_by` text DEFAULT NULL,
  PRIMARY KEY (`name`),
  KEY `modified` (`modified`),
  KEY `ref_doctype_docname_index` (`ref_doctype`,`docname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci ROW_FORMAT=DYNAMIC;
