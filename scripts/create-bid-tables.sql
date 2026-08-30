-- Migration: create all bid_* tables in Estimation's production DB
-- These tables are read-only from Estimation's perspective (owned by the Bidding platform).
-- No foreign key constraints are added — Bidding manages referential integrity.
-- Run: mysql -u root -pNepEst2026Secure nepaliestimate < scripts/create-bid-tables.sql

CREATE TABLE IF NOT EXISTS bid_organizations (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(200) NOT NULL,
  district VARCHAR(100) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  class VARCHAR(50) NOT NULL DEFAULT 'UNCLASSIFIED',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_platform_settings (
  id INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY bid_platform_settings_key_key (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_users (
  id INT NOT NULL AUTO_INCREMENT,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(191) NOT NULL,
  role VARCHAR(50) NOT NULL,
  account_type VARCHAR(50) NOT NULL DEFAULT 'INDIVIDUAL',
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  org_id INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bid_users_email_key (email),
  INDEX bid_users_org_id_idx (org_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_platform_settings (
  id INT NOT NULL AUTO_INCREMENT,
  `key` VARCHAR(100) NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY bps_key_key (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_tenders (
  id INT NOT NULL AUTO_INCREMENT,
  reference_number VARCHAR(50) NOT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NOT NULL,
  district VARCHAR(100) NOT NULL,
  location_detail VARCHAR(500) NULL,
  tender_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  bid_deadline DATETIME(3) NOT NULL,
  qanda_deadline DATETIME(3) NULL,
  estimated_value DECIMAL(15,2) NULL,
  site_visit_required BOOLEAN NOT NULL DEFAULT FALSE,
  site_visit_scheduled_at DATETIME(3) NULL,
  site_visit_location VARCHAR(500) NULL,
  quantity_visibility VARCHAR(50) NOT NULL DEFAULT 'HIDDEN',
  show_bidder_count BOOLEAN NOT NULL DEFAULT FALSE,
  show_estimated_value_on_card BOOLEAN NOT NULL DEFAULT FALSE,
  show_client_identity_on_card BOOLEAN NOT NULL DEFAULT TRUE,
  bid_security_required BOOLEAN NOT NULL DEFAULT FALSE,
  bid_security_percentage DECIMAL(5,2) NOT NULL DEFAULT 0,
  require_rtb_approval BOOLEAN NOT NULL DEFAULT FALSE,
  vat_percentage DECIMAL(5,2) NOT NULL,
  contingency_percentage_default DECIMAL(5,2) NOT NULL,
  instructions_to_bidders TEXT NULL,
  estimation_project_id VARCHAR(191) NULL,
  awarded_bidder_id INT NULL,
  awarded_amount_npr DECIMAL(15,2) NULL,
  awarded_at DATETIME(3) NULL,
  client_user_id INT NOT NULL,
  client_org_id INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bid_tenders_ref_key (reference_number),
  INDEX bid_tenders_client_user_id_idx (client_user_id),
  INDEX bid_tenders_status_idx (status)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_boq_chapters (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  parent_chapter_id INT NULL,
  title VARCHAR(300) NOT NULL,
  description TEXT NULL,
  level INT NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  INDEX bid_boq_chapters_tender_id_idx (tender_id),
  INDEX bid_boq_chapters_parent_id_idx (parent_chapter_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_boq_items (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  chapter_id INT NOT NULL,
  item_code VARCHAR(191) NULL,
  description VARCHAR(2000) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  client_quantity DECIMAL(15,4) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_alternative BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  INDEX bid_boq_items_chapter_id_idx (chapter_id),
  INDEX bid_boq_items_tender_id_idx (tender_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_submissions (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  bidder_user_id INT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  version INT NOT NULL DEFAULT 1,
  grand_total_npr DECIMAL(15,2) NULL,
  vat_amount_npr DECIMAL(15,2) NULL,
  contingency_amount_npr DECIMAL(15,2) NULL,
  contingency_percentage DECIMAL(5,2) NULL,
  total_with_vat_npr DECIMAL(15,2) NULL,
  notes_to_client TEXT NULL,
  submitted_at DATETIME(3) NULL,
  withdrawn_at DATETIME(3) NULL,
  withdrawal_reason TEXT NULL,
  withdrawal_count INT NOT NULL DEFAULT 0,
  flagged_for_withdrawal BOOLEAN NOT NULL DEFAULT FALSE,
  price_score DECIMAL(5,2) NULL,
  quantity_score DECIMAL(5,2) NULL,
  rating_score DECIMAL(5,2) NULL,
  verified_score DECIMAL(5,2) NULL,
  system_score DECIMAL(5,2) NULL,
  outlier_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  is_former_consultant BOOLEAN NOT NULL DEFAULT FALSE,
  client_note TEXT NULL,
  manual_rank INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_submissions_tender_id_idx (tender_id),
  INDEX bid_submissions_bidder_user_id_idx (bidder_user_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_line_items (
  id INT NOT NULL AUTO_INCREMENT,
  bid_id INT NOT NULL,
  boq_item_id INT NOT NULL,
  bidder_quantity DECIMAL(15,4) NULL,
  bidder_rate_npr DECIMAL(15,2) NOT NULL,
  amount_npr DECIMAL(15,2) NOT NULL,
  quantity_justification TEXT NULL,
  item_notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_line_items_bid_id_idx (bid_id),
  INDEX bid_line_items_boq_item_id_idx (boq_item_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_loas (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  winning_bid_id INT NOT NULL,
  issued_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bid_loas_tender_id_key (tender_id),
  UNIQUE KEY bid_loas_winning_bid_id_key (winning_bid_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_contracts (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  loa_id INT NOT NULL,
  winning_bid_id INT NOT NULL,
  contract_text LONGTEXT NOT NULL,
  price_escalation_type VARCHAR(50) NOT NULL DEFAULT 'FIXED',
  price_escalation_trigger_percentage DECIMAL(5,2) NULL,
  completion_start_date DATETIME(3) NULL,
  completion_end_date DATETIME(3) NULL,
  mobilization_advance_percentage DECIMAL(5,2) NULL,
  retention_percentage DECIMAL(5,2) NULL,
  dlp_months INT NULL,
  dlp_start_date DATETIME(3) NULL,
  dlp_end_date DATETIME(3) NULL,
  retention_status VARCHAR(50) NOT NULL DEFAULT 'HELD',
  status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
  contractor_otp_hash VARCHAR(255) NULL,
  contractor_otp_expires_at DATETIME(3) NULL,
  contractor_signed_at DATETIME(3) NULL,
  client_otp_hash VARCHAR(255) NULL,
  client_otp_expires_at DATETIME(3) NULL,
  client_signed_at DATETIME(3) NULL,
  hardcopy_upload_url VARCHAR(1000) NULL,
  hardcopy_marked_at DATETIME(3) NULL,
  pdf_url VARCHAR(1000) NULL,
  pdf_generated_at DATETIME(3) NULL,
  file_size_bytes INT NULL,
  current_draft_version INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bid_contracts_tender_id_key (tender_id),
  UNIQUE KEY bid_contracts_loa_id_key (loa_id),
  UNIQUE KEY bid_contracts_winning_bid_id_key (winning_bid_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_tender_request_to_bid (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  contractor_user_id INT NOT NULL,
  message TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  client_response_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_rtb_tender_id_idx (tender_id),
  INDEX bid_rtb_contractor_user_id_idx (contractor_user_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_tender_invitations (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  contractor_user_id INT NULL,
  contractor_email VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  invited_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  responded_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_invitations_tender_id_idx (tender_id),
  INDEX bid_invitations_contractor_user_id_idx (contractor_user_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_tender_watchlist (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  tender_id INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bid_watchlist_user_tender_key (user_id, tender_id),
  INDEX bid_watchlist_user_id_idx (user_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_qanda_questions (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  asked_by_user_id INT NOT NULL,
  question_text TEXT NULL,
  drawing_id INT NULL,
  attachment_url VARCHAR(500) NULL,
  attachment_type VARCHAR(30) NOT NULL DEFAULT 'TEXT',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  is_public BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_qanda_questions_tender_id_idx (tender_id),
  INDEX bid_qanda_questions_status_idx (status)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_qanda_answers (
  id INT NOT NULL AUTO_INCREMENT,
  question_id INT NOT NULL,
  answered_by_user_id INT NOT NULL,
  answer_text TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_qanda_answers_question_id_idx (question_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_negotiations (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  bidder_user_id INT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  deadline DATETIME(3) NOT NULL,
  original_grand_total_npr DECIMAL(15,2) NOT NULL,
  current_proposed_total_npr DECIMAL(15,2) NOT NULL,
  proposed_discount_percentage DECIMAL(5,2) NOT NULL,
  initiated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  closed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_negotiations_tender_id_idx (tender_id),
  INDEX bid_negotiations_bidder_user_id_idx (bidder_user_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_negotiation_messages (
  id INT NOT NULL AUTO_INCREMENT,
  negotiation_id INT NOT NULL,
  sender_user_id INT NOT NULL,
  message_type VARCHAR(50) NOT NULL DEFAULT 'TEXT',
  message_text TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_negotiation_messages_negotiation_id_idx (negotiation_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_portfolio_projects (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  project_name VARCHAR(200) NOT NULL,
  client_type VARCHAR(50) NOT NULL,
  contract_value_range VARCHAR(50) NOT NULL,
  year_of_completion INT NOT NULL,
  role VARCHAR(50) NOT NULL,
  description TEXT NULL,
  photo_urls JSON NOT NULL,
  source VARCHAR(50) NOT NULL DEFAULT 'SELF_REPORTED',
  related_tender_id INT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_portfolio_projects_user_id_idx (user_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_contract_revisions (
  id INT NOT NULL AUTO_INCREMENT,
  contract_id INT NOT NULL,
  revision_number INT NOT NULL,
  content LONGTEXT NOT NULL,
  submitted_by_user_id INT NOT NULL,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_contract_revisions_contract_id_idx (contract_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_contract_comments (
  id INT NOT NULL AUTO_INCREMENT,
  contract_id INT NOT NULL,
  clause_reference VARCHAR(200) NULL,
  comment_text TEXT NOT NULL,
  commenter_user_id INT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  resolved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_contract_comments_contract_id_idx (contract_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_snag_items (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  added_by_user_id INT NOT NULL,
  item_number INT NOT NULL,
  description TEXT NOT NULL,
  location_reference VARCHAR(300) NULL,
  priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
  status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
  fixed_notes TEXT NULL,
  rejection_reason TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_snag_items_tender_id_idx (tender_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_completion_requests (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  attempt_number INT NOT NULL DEFAULT 1,
  submitted_by_user_id INT NOT NULL,
  completion_notes TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  approved_at DATETIME(3) NULL,
  rejected_at DATETIME(3) NULL,
  rejection_reason TEXT NULL,
  expired_at DATETIME(3) NULL,
  escalated_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bid_completion_requests_tender_id_idx (tender_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_ratings (
  id INT NOT NULL AUTO_INCREMENT,
  tender_id INT NOT NULL,
  rater_user_id INT NOT NULL,
  rated_user_id INT NOT NULL,
  rating_direction VARCHAR(50) NOT NULL,
  score_1 INT NOT NULL,
  score_2 INT NOT NULL,
  score_3 INT NOT NULL,
  score_4 INT NOT NULL,
  score_5 INT NOT NULL,
  average_score DECIMAL(3,2) NOT NULL,
  review_text TEXT NULL,
  is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  window_opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  window_closes_at DATETIME(3) NULL,
  is_visible BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bid_ratings_tender_rater_key (tender_id, rater_user_id),
  INDEX bid_ratings_tender_id_idx (tender_id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_notification_templates (
  id INT NOT NULL AUTO_INCREMENT,
  event_key VARCHAR(191) NOT NULL,
  display_name VARCHAR(191) NOT NULL,
  email_subject VARCHAR(191) NOT NULL,
  email_body TEXT NOT NULL,
  channel_priority VARCHAR(50) NOT NULL DEFAULT 'MEDIUM',
  is_disableable BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY bid_notification_templates_event_key_key (event_key)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  id VARCHAR(191) NOT NULL,
  userId VARCHAR(191) NOT NULL,
  eventKey VARCHAR(191) NOT NULL,
  emailEnabled BOOLEAN NOT NULL DEFAULT TRUE,
  inAppEnabled BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY notification_preferences_userId_eventKey_key (userId, eventKey),
  INDEX notification_preferences_userId_idx (userId)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS bid_verification_documents (
  id INT NOT NULL AUTO_INCREMENT,
  userId VARCHAR(191) NOT NULL,
  orgId VARCHAR(191) NULL,
  documentType VARCHAR(191) NOT NULL,
  fileUrl LONGTEXT NOT NULL,
  fileSizeBytes BIGINT NOT NULL DEFAULT 0,
  status VARCHAR(191) NOT NULL DEFAULT 'PENDING',
  rejectionReason LONGTEXT NULL,
  reviewedByAdminId VARCHAR(191) NULL,
  reviewedAt DATETIME(3) NULL,
  createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  INDEX bvd_userId_idx (userId),
  INDEX bvd_status_idx (status)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
