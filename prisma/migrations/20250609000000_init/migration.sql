-- CreateTable
CREATE TABLE "discord_users" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "global_name" TEXT,
    "discriminator" TEXT,
    "avatar" TEXT,
    "profile_json" JSONB,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_tokens" (
    "discord_user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" INTEGER NOT NULL,
    "expires_in" INTEGER NOT NULL,
    "token_type" TEXT NOT NULL DEFAULT 'Bearer',
    "created_at" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_tokens_pkey" PRIMARY KEY ("discord_user_id")
);

-- CreateTable
CREATE TABLE "pishock_settings" (
    "discord_user_id" TEXT NOT NULL,
    "encrypted_creds" TEXT NOT NULL,
    "max_intensity" INTEGER NOT NULL DEFAULT 100,
    "max_duration" INTEGER NOT NULL DEFAULT 15,
    "banned_executors" JSONB NOT NULL DEFAULT '[]',
    "commands_paused" BOOLEAN NOT NULL DEFAULT false,
    "has_own_device" BOOLEAN NOT NULL DEFAULT false,
    "pishock_user_id" TEXT,
    "shocker_id" TEXT,
    "device_count" INTEGER NOT NULL DEFAULT 0,
    "last_tested" TIMESTAMP(3),
    "configured_by" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pishock_settings_pkey" PRIMARY KEY ("discord_user_id")
);

-- CreateTable
CREATE TABLE "activity_instances" (
    "instance_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "participant_count" INTEGER NOT NULL DEFAULT 0,
    "last_activity" TIMESTAMP(3) NOT NULL,
    "last_verified" TIMESTAMP(3),
    "last_authenticated_user" TEXT,
    "discord_verified" BOOLEAN NOT NULL DEFAULT false,
    "location_json" JSONB,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_instances_pkey" PRIMARY KEY ("instance_id")
);

-- CreateTable
CREATE TABLE "instance_data" (
    "instance_id" TEXT NOT NULL,
    "selected_user_id" TEXT,
    "multishock_map" JSONB,
    "participant_ids" JSONB,
    "payload_json" JSONB,
    "updated_by" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instance_data_pkey" PRIMARY KEY ("instance_id")
);

-- CreateTable
CREATE TABLE "activity_log_entries" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "instance_id" TEXT NOT NULL DEFAULT 'global',
    "executor_user_id" TEXT NOT NULL,
    "executor_username" TEXT NOT NULL,
    "executor_avatar" TEXT,
    "target_user_id" TEXT NOT NULL,
    "target_username" TEXT NOT NULL,
    "target_avatar" TEXT,
    "action" TEXT NOT NULL,
    "intensity" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "guild_id" TEXT,
    "guild_name" TEXT,

    CONSTRAINT "activity_log_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monetization_acks" (
    "discord_user_id" TEXT NOT NULL,
    "has_seen_first_bypass_warning" BOOLEAN NOT NULL DEFAULT false,
    "has_seen_first_overlimit_purchase_warning" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monetization_acks_pkey" PRIMARY KEY ("discord_user_id")
);

-- CreateTable
CREATE TABLE "status_caches" (
    "discord_user_id" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "status_caches_pkey" PRIMARY KEY ("discord_user_id")
);

-- CreateTable
CREATE TABLE "token_validation_cache" (
    "token_suffix" TEXT NOT NULL,
    "discord_user_id" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "token_validation_cache_pkey" PRIMARY KEY ("token_suffix")
);

-- CreateIndex
CREATE INDEX "activity_log_entries_timestamp_idx" ON "activity_log_entries"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "activity_log_entries_executor_user_id_idx" ON "activity_log_entries"("executor_user_id");

-- CreateIndex
CREATE INDEX "activity_log_entries_target_user_id_idx" ON "activity_log_entries"("target_user_id");

-- CreateIndex
CREATE INDEX "status_caches_cache_key_idx" ON "status_caches"("cache_key");

-- AddForeignKey
ALTER TABLE "discord_tokens" ADD CONSTRAINT "discord_tokens_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "discord_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pishock_settings" ADD CONSTRAINT "pishock_settings_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "discord_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instance_data" ADD CONSTRAINT "instance_data_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "activity_instances"("instance_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monetization_acks" ADD CONSTRAINT "monetization_acks_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "discord_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_caches" ADD CONSTRAINT "status_caches_discord_user_id_fkey" FOREIGN KEY ("discord_user_id") REFERENCES "discord_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
