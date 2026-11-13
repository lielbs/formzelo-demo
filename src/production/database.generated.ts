
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {

  "public": {
          Tables: {
            "audit_events": {
                  Row: {
                    "actor_user_id": string | null,"created_at": string,"id": string,"operation": string,"organization_id": string,"resource_id": string,"resource_type": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_user_id"?: string | null,"created_at"?: string,"id"?: string,"operation": string,"organization_id": string,"resource_id": string,"resource_type": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"created_at"?: string,"id"?: string,"operation"?: string,"organization_id"?: string,"resource_id"?: string,"resource_type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"brand_configurations": {
                  Row: {
                    "config": NonNullable<Json>,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "brand_configurations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"customer_actions": {
                  Row: {
                    "amount_minor": number | null,"cancelled_at": string | null,"created_at": string,"created_by": string,"description": string,"expires_at": string | null,"id": string,"kind": string,"note": string | null,"options": NonNullable<Json>,"organization_id": string,"response": Json | null,"status": string,"submission_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor"?: number | null,"cancelled_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string,"expires_at"?: string | null,"id"?: string,"kind": string,"note"?: string | null,"options"?: NonNullable<Json>,"organization_id": string,"response"?: Json | null,"status": string,"submission_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "amount_minor"?: number | null,"cancelled_at"?: string | null,"created_at"?: string,"created_by"?: string,"description"?: string,"expires_at"?: string | null,"id"?: string,"kind"?: string,"note"?: string | null,"options"?: NonNullable<Json>,"organization_id"?: string,"response"?: Json | null,"status"?: string,"submission_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "customer_actions_organization_id_submission_id_fkey"
      columns: ["organization_id","submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"integration_connections": {
                  Row: {
                    "category": string,"created_at": string,"display_name": string,"id": string,"organization_id": string,"provider_key": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"created_at"?: string,"display_name": string,"id"?: string,"organization_id": string,"provider_key": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"display_name"?: string,"id"?: string,"organization_id"?: string,"provider_key"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "integration_connections_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_assets": {
                  Row: {
                    "bytes": number,"created_at": string,"created_by": string,"height": number,"id": string,"kind": string,"mime": string,"name": string,"organization_id": string,"removed_at": string | null,"width": number
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes": number,"created_at"?: string,"created_by"?: string,"height": number,"id": string,"kind": string,"mime": string,"name": string,"organization_id": string,"removed_at"?: string | null,"width": number
                  }
                  Update: {
                    "bytes"?: number,"created_at"?: string,"created_by"?: string,"height"?: number,"id"?: string,"kind"?: string,"mime"?: string,"name"?: string,"organization_id"?: string,"removed_at"?: string | null,"width"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_assets_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_memberships": {
                  Row: {
                    "access": string,"created_at": string,"organization_id": string,"role": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access"?: string,"created_at"?: string,"organization_id": string,"role": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "access"?: string,"created_at"?: string,"organization_id"?: string,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organization_settings": {
                  Row: {
                    "config": NonNullable<Json>,"organization_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "config"?: NonNullable<Json>,"organization_id": string,"updated_at"?: string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"organization_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organization_settings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"slug": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"slug": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"slug"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [

                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [

                  ]
                },"quotes": {
                  Row: {
                    "content": NonNullable<Json>,"created_at": string,"created_by": string,"decided_at": string | null,"decision": Json | null,"decision_key": string | null,"id": string,"lock_version": number,"organization_id": string,"revision": number,"sent_at": string | null,"status": string,"submission_id": string,"total_minor": number,"updated_at": string,"valid_until": string | null,"viewed_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "content": NonNullable<Json>,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"decision"?: Json | null,"decision_key"?: string | null,"id"?: string,"lock_version"?: number,"organization_id": string,"revision": number,"sent_at"?: string | null,"status": string,"submission_id": string,"total_minor": number,"updated_at"?: string,"valid_until"?: string | null,"viewed_at"?: string | null
                  }
                  Update: {
                    "content"?: NonNullable<Json>,"created_at"?: string,"created_by"?: string,"decided_at"?: string | null,"decision"?: Json | null,"decision_key"?: string | null,"id"?: string,"lock_version"?: number,"organization_id"?: string,"revision"?: number,"sent_at"?: string | null,"status"?: string,"submission_id"?: string,"total_minor"?: number,"updated_at"?: string,"valid_until"?: string | null,"viewed_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "quotes_organization_id_submission_id_fkey"
      columns: ["organization_id","submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"submission_events": {
                  Row: {
                    "actor_user_id": string | null,"created_at": string,"event_type": string,"id": string,"message": string | null,"organization_id": string,"submission_id": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_user_id"?: string | null,"created_at"?: string,"event_type": string,"id"?: string,"message"?: string | null,"organization_id": string,"submission_id": string,"visibility"?: string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"created_at"?: string,"event_type"?: string,"id"?: string,"message"?: string | null,"organization_id"?: string,"submission_id"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_events_organization_id_submission_id_fkey"
      columns: ["organization_id","submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"submission_notes": {
                  Row: {
                    "author_user_id": string,"body": string,"created_at": string,"id": string,"organization_id": string,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_user_id"?: string,"body": string,"created_at"?: string,"id"?: string,"organization_id": string,"submission_id": string
                  }
                  Update: {
                    "author_user_id"?: string,"body"?: string,"created_at"?: string,"id"?: string,"organization_id"?: string,"submission_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submission_notes_organization_id_submission_id_fkey"
      columns: ["organization_id","submission_id"]
isOneToOne: false
      referencedRelation: "submissions"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"submissions": {
                  Row: {
                    "answers": NonNullable<Json>,"created_at": string,"currency": string,"id": string,"idempotency_key": string,"lock_version": number,"organization_id": string,"public_client_token": string,"request_hash": string,"status": string,"total_minor": number,"updated_at": string,"workflow_id": string,"workflow_version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "answers": NonNullable<Json>,"created_at"?: string,"currency": string,"id"?: string,"idempotency_key": string,"lock_version"?: number,"organization_id": string,"public_client_token"?: string,"request_hash": string,"status"?: string,"total_minor": number,"updated_at"?: string,"workflow_id": string,"workflow_version_id": string
                  }
                  Update: {
                    "answers"?: NonNullable<Json>,"created_at"?: string,"currency"?: string,"id"?: string,"idempotency_key"?: string,"lock_version"?: number,"organization_id"?: string,"public_client_token"?: string,"request_hash"?: string,"status"?: string,"total_minor"?: number,"updated_at"?: string,"workflow_id"?: string,"workflow_version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "submissions_organization_id_workflow_id_workflow_version_i_fkey"
      columns: ["organization_id","workflow_id","workflow_version_id"]
isOneToOne: false
      referencedRelation: "workflow_versions"
      referencedColumns: ["organization_id","workflow_id","id"]
    }
                  ]
                },"tables_allocations": {
                  Row: {
                    "created_at": string,"expires_at": string | null,"group_id": string,"id": string,"occupied_during": unknown,"organization_id": string,"physical_table_id": string,"released_at": string | null,"reservation_id": string | null,"state": string,"venue_id": string,"waitlist_entry_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"expires_at"?: string | null,"group_id": string,"id"?: string,"occupied_during": unknown,"organization_id": string,"physical_table_id": string,"released_at"?: string | null,"reservation_id"?: string | null,"state": string,"venue_id": string,"waitlist_entry_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"expires_at"?: string | null,"group_id"?: string,"id"?: string,"occupied_during"?: unknown,"organization_id"?: string,"physical_table_id"?: string,"released_at"?: string | null,"reservation_id"?: string | null,"state"?: string,"venue_id"?: string,"waitlist_entry_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_allocations_organization_id_venue_id_physical_table_fkey"
      columns: ["organization_id","venue_id","physical_table_id"]
isOneToOne: false
      referencedRelation: "tables_physical_tables"
      referencedColumns: ["organization_id","venue_id","id"]
    },{
      foreignKeyName: "tables_allocations_organization_id_venue_id_reservation_id_fkey"
      columns: ["organization_id","venue_id","reservation_id"]
isOneToOne: false
      referencedRelation: "tables_reservations"
      referencedColumns: ["organization_id","venue_id","id"]
    },{
      foreignKeyName: "tables_allocations_organization_id_venue_id_waitlist_entry_fkey"
      columns: ["organization_id","venue_id","waitlist_entry_id"]
isOneToOne: false
      referencedRelation: "tables_waitlist_entries"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_combination_members": {
                  Row: {
                    "combination_id": string,"organization_id": string,"physical_table_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "combination_id": string,"organization_id": string,"physical_table_id": string,"venue_id": string
                  }
                  Update: {
                    "combination_id"?: string,"organization_id"?: string,"physical_table_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_combination_members_organization_id_venue_id_combin_fkey"
      columns: ["organization_id","venue_id","combination_id"]
isOneToOne: false
      referencedRelation: "tables_combinations"
      referencedColumns: ["organization_id","venue_id","id"]
    },{
      foreignKeyName: "tables_combination_members_organization_id_venue_id_physic_fkey"
      columns: ["organization_id","venue_id","physical_table_id"]
isOneToOne: false
      referencedRelation: "tables_physical_tables"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_combinations": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"label": string,"max_covers": number,"min_covers": number,"organization_id": string,"priority": number,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id": string,"label": string,"max_covers": number,"min_covers": number,"organization_id": string,"priority"?: number,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"label"?: string,"max_covers"?: number,"min_covers"?: number,"organization_id"?: string,"priority"?: number,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_combinations_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"tables_guests": {
                  Row: {
                    "created_at": string,"display_name": string,"email": string | null,"id": string,"marketing_consent": boolean,"organization_id": string,"phone_e164": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"email"?: string | null,"id"?: string,"marketing_consent"?: boolean,"organization_id": string,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"email"?: string | null,"id"?: string,"marketing_consent"?: boolean,"organization_id"?: string,"phone_e164"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_guests_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tables_layout_table_snapshots": {
                  Row: {
                    "geometry": NonNullable<Json>,"label": string,"max_covers": number,"min_covers": number,"organization_id": string,"physical_table_id": string,"shape": string,"venue_id": string,"version_id": string,"zone_id": string,"zone_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "geometry": NonNullable<Json>,"label": string,"max_covers": number,"min_covers": number,"organization_id": string,"physical_table_id": string,"shape": string,"venue_id": string,"version_id": string,"zone_id": string,"zone_name": string
                  }
                  Update: {
                    "geometry"?: NonNullable<Json>,"label"?: string,"max_covers"?: number,"min_covers"?: number,"organization_id"?: string,"physical_table_id"?: string,"shape"?: string,"venue_id"?: string,"version_id"?: string,"zone_id"?: string,"zone_name"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_layout_table_snapshots_organization_id_venue_id_phy_fkey"
      columns: ["organization_id","venue_id","physical_table_id"]
isOneToOne: false
      referencedRelation: "tables_physical_tables"
      referencedColumns: ["organization_id","venue_id","id"]
    },{
      foreignKeyName: "tables_layout_table_snapshots_organization_id_venue_id_ver_fkey"
      columns: ["organization_id","venue_id","version_id"]
isOneToOne: false
      referencedRelation: "tables_venue_versions"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_menu_versions": {
                  Row: {
                    "created_at": string,"id": string,"menu_id": string,"organization_id": string,"published_by": string,"snapshot": NonNullable<Json>,"venue_id": string,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"menu_id": string,"organization_id": string,"published_by": string,"snapshot": NonNullable<Json>,"venue_id": string,"version_number": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"menu_id"?: string,"organization_id"?: string,"published_by"?: string,"snapshot"?: NonNullable<Json>,"venue_id"?: string,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_menu_versions_organization_id_venue_id_menu_id_fkey"
      columns: ["organization_id","venue_id","menu_id"]
isOneToOne: false
      referencedRelation: "tables_menus"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_menus": {
                  Row: {
                    "created_at": string,"draft": NonNullable<Json>,"id": string,"lock_version": number,"organization_id": string,"published_version_id": string | null,"sort_order": number,"status": string,"title": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"draft"?: NonNullable<Json>,"id"?: string,"lock_version"?: number,"organization_id": string,"published_version_id"?: string | null,"sort_order"?: number,"status"?: string,"title": string,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"draft"?: NonNullable<Json>,"id"?: string,"lock_version"?: number,"organization_id"?: string,"published_version_id"?: string | null,"sort_order"?: number,"status"?: string,"title"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_menu_published_version"
      columns: ["published_version_id"]
isOneToOne: false
      referencedRelation: "tables_menu_versions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tables_menus_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"tables_notes": {
                  Row: {
                    "author_user_id": string,"body": string,"created_at": string,"guest_id": string | null,"id": string,"organization_id": string,"reservation_id": string | null,"venue_id": string,"visibility": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_user_id": string,"body": string,"created_at"?: string,"guest_id"?: string | null,"id"?: string,"organization_id": string,"reservation_id"?: string | null,"venue_id": string,"visibility": string
                  }
                  Update: {
                    "author_user_id"?: string,"body"?: string,"created_at"?: string,"guest_id"?: string | null,"id"?: string,"organization_id"?: string,"reservation_id"?: string | null,"venue_id"?: string,"visibility"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_notes_organization_id_guest_id_fkey"
      columns: ["organization_id","guest_id"]
isOneToOne: false
      referencedRelation: "tables_guests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "tables_notes_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "tables_notes_organization_id_venue_id_reservation_id_fkey"
      columns: ["organization_id","venue_id","reservation_id"]
isOneToOne: false
      referencedRelation: "tables_reservations"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_organization_features": {
                  Row: {
                    "enabled": boolean,"organization_id": string,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "enabled"?: boolean,"organization_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "enabled"?: boolean,"organization_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_organization_features_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tables_physical_tables": {
                  Row: {
                    "accessible": boolean,"active": boolean,"archived_at": string | null,"created_at": string,"id": string,"label": string,"max_covers": number,"min_covers": number,"organization_id": string,"shape": string,"updated_at": string,"venue_id": string,"zone_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accessible"?: boolean,"active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"id": string,"label": string,"max_covers": number,"min_covers": number,"organization_id": string,"shape"?: string,"updated_at"?: string,"venue_id": string,"zone_id": string
                  }
                  Update: {
                    "accessible"?: boolean,"active"?: boolean,"archived_at"?: string | null,"created_at"?: string,"id"?: string,"label"?: string,"max_covers"?: number,"min_covers"?: number,"organization_id"?: string,"shape"?: string,"updated_at"?: string,"venue_id"?: string,"zone_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_physical_tables_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "tables_physical_tables_organization_id_venue_id_zone_id_fkey"
      columns: ["organization_id","venue_id","zone_id"]
isOneToOne: false
      referencedRelation: "tables_zones"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_reservation_events": {
                  Row: {
                    "actor_type": string,"actor_user_id": string | null,"created_at": string,"event_type": string,"from_status": string | null,"id": string,"metadata": NonNullable<Json>,"organization_id": string,"reason": string | null,"reservation_id": string,"seq": number,"to_status": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_type": string,"actor_user_id"?: string | null,"created_at"?: string,"event_type": string,"from_status"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id": string,"reason"?: string | null,"reservation_id": string,"seq": number,"to_status"?: string | null,"venue_id": string
                  }
                  Update: {
                    "actor_type"?: string,"actor_user_id"?: string | null,"created_at"?: string,"event_type"?: string,"from_status"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"organization_id"?: string,"reason"?: string | null,"reservation_id"?: string,"seq"?: number,"to_status"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_reservation_events_organization_id_venue_id_reserva_fkey"
      columns: ["organization_id","venue_id","reservation_id"]
isOneToOne: false
      referencedRelation: "tables_reservations"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_reservations": {
                  Row: {
                    "approval": string,"approval_rule": string | null,"arrived_at": string | null,"buffer_minutes": number,"cancelled_at": string | null,"client_token": string | null,"completed_at": string | null,"created_at": string,"created_by": string | null,"custom_answers": Json | null,"ends_at": string,"guest_email": string | null,"guest_id": string | null,"guest_name": string,"guest_phone": string | null,"id": string,"idempotency_key": string,"local_time": string,"lock_version": number,"organization_id": string,"override_reason": string | null,"party_size": number,"pending_expires_at": string | null,"reference": string,"request_hash": string,"requests": string | null,"seated_at": string | null,"service_date": string,"service_key": string,"source": string,"starts_at": string,"status": string,"terms_accepted_at": string | null,"updated_at": string,"venue_id": string,"version_id": string,"zone_preference": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "approval": string,"approval_rule"?: string | null,"arrived_at"?: string | null,"buffer_minutes"?: number,"cancelled_at"?: string | null,"client_token"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom_answers"?: Json | null,"ends_at": string,"guest_email"?: string | null,"guest_id"?: string | null,"guest_name": string,"guest_phone"?: string | null,"id"?: string,"idempotency_key": string,"local_time": string,"lock_version"?: number,"organization_id": string,"override_reason"?: string | null,"party_size": number,"pending_expires_at"?: string | null,"reference": string,"request_hash": string,"requests"?: string | null,"seated_at"?: string | null,"service_date": string,"service_key": string,"source": string,"starts_at": string,"status": string,"terms_accepted_at"?: string | null,"updated_at"?: string,"venue_id": string,"version_id": string,"zone_preference"?: string | null
                  }
                  Update: {
                    "approval"?: string,"approval_rule"?: string | null,"arrived_at"?: string | null,"buffer_minutes"?: number,"cancelled_at"?: string | null,"client_token"?: string | null,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom_answers"?: Json | null,"ends_at"?: string,"guest_email"?: string | null,"guest_id"?: string | null,"guest_name"?: string,"guest_phone"?: string | null,"id"?: string,"idempotency_key"?: string,"local_time"?: string,"lock_version"?: number,"organization_id"?: string,"override_reason"?: string | null,"party_size"?: number,"pending_expires_at"?: string | null,"reference"?: string,"request_hash"?: string,"requests"?: string | null,"seated_at"?: string | null,"service_date"?: string,"service_key"?: string,"source"?: string,"starts_at"?: string,"status"?: string,"terms_accepted_at"?: string | null,"updated_at"?: string,"venue_id"?: string,"version_id"?: string,"zone_preference"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_reservations_organization_id_guest_id_fkey"
      columns: ["organization_id","guest_id"]
isOneToOne: false
      referencedRelation: "tables_guests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "tables_reservations_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "tables_reservations_organization_id_venue_id_version_id_fkey"
      columns: ["organization_id","venue_id","version_id"]
isOneToOne: false
      referencedRelation: "tables_venue_versions"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_service_exceptions": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"kind": string,"note": string | null,"organization_id": string,"service_date": string,"service_key": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"kind": string,"note"?: string | null,"organization_id": string,"service_date": string,"service_key"?: string | null,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"kind"?: string,"note"?: string | null,"organization_id"?: string,"service_date"?: string,"service_key"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_service_exceptions_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"tables_shift_revisions": {
                  Row: {
                    "organization_id": string,"revision": number,"service_date": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"revision"?: number,"service_date": string,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "organization_id"?: string,"revision"?: number,"service_date"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_shift_revisions_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"tables_table_states": {
                  Row: {
                    "organization_id": string,"physical_table_id": string,"reason": string | null,"state": string,"until": string | null,"updated_at": string,"updated_by": string | null,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"physical_table_id": string,"reason"?: string | null,"state": string,"until"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"venue_id": string
                  }
                  Update: {
                    "organization_id"?: string,"physical_table_id"?: string,"reason"?: string | null,"state"?: string,"until"?: string | null,"updated_at"?: string,"updated_by"?: string | null,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_table_states_organization_id_venue_id_physical_tabl_fkey"
      columns: ["organization_id","venue_id","physical_table_id"]
isOneToOne: false
      referencedRelation: "tables_physical_tables"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_venue_staff": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": string,"status": string,"updated_at": string,"updated_by": string | null,"user_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role": string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id": string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: string,"status"?: string,"updated_at"?: string,"updated_by"?: string | null,"user_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_venue_staff_organization_id_user_id_fkey"
      columns: ["organization_id","user_id"]
isOneToOne: false
      referencedRelation: "organization_memberships"
      referencedColumns: ["organization_id","user_id"]
    },{
      foreignKeyName: "tables_venue_staff_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"tables_venue_versions": {
                  Row: {
                    "created_at": string,"id": string,"organization_id": string,"published_by": string,"snapshot": NonNullable<Json>,"venue_id": string,"version_number": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"organization_id": string,"published_by": string,"snapshot": NonNullable<Json>,"venue_id": string,"version_number": number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"organization_id"?: string,"published_by"?: string,"snapshot"?: NonNullable<Json>,"venue_id"?: string,"version_number"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_venue_versions_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"tables_venues": {
                  Row: {
                    "created_at": string,"created_by": string,"current_version_id": string | null,"draft": NonNullable<Json>,"id": string,"lock_version": number,"name": string,"organization_id": string,"slug": string,"status": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"current_version_id"?: string | null,"draft"?: NonNullable<Json>,"id"?: string,"lock_version"?: number,"name": string,"organization_id": string,"slug": string,"status"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"current_version_id"?: string | null,"draft"?: NonNullable<Json>,"id"?: string,"lock_version"?: number,"name"?: string,"organization_id"?: string,"slug"?: string,"status"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_venue_current_version"
      columns: ["organization_id","id","current_version_id"]
isOneToOne: false
      referencedRelation: "tables_venue_versions"
      referencedColumns: ["organization_id","venue_id","id"]
    },{
      foreignKeyName: "tables_venues_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"tables_waitlist_entries": {
                  Row: {
                    "client_token": string | null,"closed_at": string | null,"created_at": string,"created_by": string | null,"custom_answers": Json | null,"guest_id": string | null,"guest_name": string,"guest_phone": string | null,"id": string,"idempotency_key": string,"joined_at": string,"lock_version": number,"notes": string | null,"offer_expires_at": string | null,"organization_id": string,"party_size": number,"priority": number,"priority_reason": string | null,"quoted_max": number | null,"quoted_min": number | null,"reservation_id": string | null,"service_date": string,"source": string,"status": string,"updated_at": string,"venue_id": string,"zone_preference": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "client_token"?: string | null,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom_answers"?: Json | null,"guest_id"?: string | null,"guest_name": string,"guest_phone"?: string | null,"id"?: string,"idempotency_key": string,"joined_at"?: string,"lock_version"?: number,"notes"?: string | null,"offer_expires_at"?: string | null,"organization_id": string,"party_size": number,"priority"?: number,"priority_reason"?: string | null,"quoted_max"?: number | null,"quoted_min"?: number | null,"reservation_id"?: string | null,"service_date": string,"source": string,"status"?: string,"updated_at"?: string,"venue_id": string,"zone_preference"?: string | null
                  }
                  Update: {
                    "client_token"?: string | null,"closed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"custom_answers"?: Json | null,"guest_id"?: string | null,"guest_name"?: string,"guest_phone"?: string | null,"id"?: string,"idempotency_key"?: string,"joined_at"?: string,"lock_version"?: number,"notes"?: string | null,"offer_expires_at"?: string | null,"organization_id"?: string,"party_size"?: number,"priority"?: number,"priority_reason"?: string | null,"quoted_max"?: number | null,"quoted_min"?: number | null,"reservation_id"?: string | null,"service_date"?: string,"source"?: string,"status"?: string,"updated_at"?: string,"venue_id"?: string,"zone_preference"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_waitlist_entries_organization_id_guest_id_fkey"
      columns: ["organization_id","guest_id"]
isOneToOne: false
      referencedRelation: "tables_guests"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "tables_waitlist_entries_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "tables_waitlist_entries_organization_id_venue_id_reservati_fkey"
      columns: ["organization_id","venue_id","reservation_id"]
isOneToOne: false
      referencedRelation: "tables_reservations"
      referencedColumns: ["organization_id","venue_id","id"]
    }
                  ]
                },"tables_zones": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"name": string,"organization_id": string,"sort_order": number,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id": string,"name": string,"organization_id": string,"sort_order"?: number,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"organization_id"?: string,"sort_order"?: number,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tables_zones_organization_id_venue_id_fkey"
      columns: ["organization_id","venue_id"]
isOneToOne: false
      referencedRelation: "tables_venues"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"workflow_integration_overrides": {
                  Row: {
                    "capability": string,"connection_id": string,"organization_id": string,"workflow_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capability": string,"connection_id": string,"organization_id": string,"workflow_id": string
                  }
                  Update: {
                    "capability"?: string,"connection_id"?: string,"organization_id"?: string,"workflow_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workflow_integration_override_organization_id_connection_i_fkey"
      columns: ["organization_id","connection_id"]
isOneToOne: false
      referencedRelation: "integration_connections"
      referencedColumns: ["organization_id","id"]
    },{
      foreignKeyName: "workflow_integration_overrides_organization_id_workflow_id_fkey"
      columns: ["organization_id","workflow_id"]
isOneToOne: false
      referencedRelation: "workflows"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"workflow_versions": {
                  Row: {
                    "config": NonNullable<Json>,"created_at": string,"design": NonNullable<Json>,"engine_version": string,"id": string,"organization_id": string,"published_by": string,"schema_version": number,"version_number": number,"workflow_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "config": NonNullable<Json>,"created_at"?: string,"design": NonNullable<Json>,"engine_version": string,"id"?: string,"organization_id": string,"published_by": string,"schema_version": number,"version_number": number,"workflow_id": string
                  }
                  Update: {
                    "config"?: NonNullable<Json>,"created_at"?: string,"design"?: NonNullable<Json>,"engine_version"?: string,"id"?: string,"organization_id"?: string,"published_by"?: string,"schema_version"?: number,"version_number"?: number,"workflow_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "workflow_versions_organization_id_workflow_id_fkey"
      columns: ["organization_id","workflow_id"]
isOneToOne: false
      referencedRelation: "workflows"
      referencedColumns: ["organization_id","id"]
    }
                  ]
                },"workflows": {
                  Row: {
                    "created_at": string,"created_by": string,"deleted_at": string | null,"draft_config": NonNullable<Json>,"draft_design": NonNullable<Json>,"id": string,"intake": NonNullable<Json>,"lock_version": number,"organization_id": string,"public_slug": string,"published_lock_version": number | null,"published_version_id": string | null,"schema_version": number,"source_prompt": string | null,"status": string,"template_key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"draft_config": NonNullable<Json>,"draft_design"?: NonNullable<Json>,"id"?: string,"intake"?: NonNullable<Json>,"lock_version"?: number,"organization_id": string,"public_slug": string,"published_lock_version"?: number | null,"published_version_id"?: string | null,"schema_version": number,"source_prompt"?: string | null,"status"?: string,"template_key"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"deleted_at"?: string | null,"draft_config"?: NonNullable<Json>,"draft_design"?: NonNullable<Json>,"id"?: string,"intake"?: NonNullable<Json>,"lock_version"?: number,"organization_id"?: string,"public_slug"?: string,"published_lock_version"?: number | null,"published_version_id"?: string | null,"schema_version"?: number,"source_prompt"?: string | null,"status"?: string,"template_key"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "published_version_same_workflow"
      columns: ["organization_id","id","published_version_id"]
isOneToOne: false
      referencedRelation: "workflow_versions"
      referencedColumns: ["organization_id","workflow_id","id"]
    },{
      foreignKeyName: "workflows_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_owner_invitation":
{ Args: { "expected_organization_id": string,"invitation_token": string }; Returns: {
              "membership_created": boolean,"organization_id": string
            }[]
                           },
"add_submission_note":
{ Args: { "p_body": string,"p_organization_id": string,"p_submission_id": string }; Returns: {
              "author_user_id": string,
"body": string,
"created_at": string,
"id": string,
"organization_id": string,
"submission_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "submission_notes"
        isOneToOne: false
        isSetofReturn: true
      } },
"cancel_customer_action":
{ Args: { "p_action_id": string,"p_organization_id": string }; Returns: {
              "amount_minor": number | null,
"cancelled_at": string | null,
"created_at": string,
"created_by": string,
"description": string,
"expires_at": string | null,
"id": string,
"kind": string,
"note": string | null,
"options": NonNullable<Json>,
"organization_id": string,
"response": Json | null,
"status": string,
"submission_id": string,
"title": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "customer_actions"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_customer_action":
{ Args: { "p_input": Json,"p_organization_id": string,"p_submission_id": string }; Returns: {
              "amount_minor": number | null,
"cancelled_at": string | null,
"created_at": string,
"created_by": string,
"description": string,
"expires_at": string | null,
"id": string,
"kind": string,
"note": string | null,
"options": NonNullable<Json>,
"organization_id": string,
"response": Json | null,
"status": string,
"submission_id": string,
"title": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "customer_actions"
        isOneToOne: false
        isSetofReturn: true
      } },
"create_staff_invitation":
{ Args: { "p_email": string,"p_organization_id": string }; Returns: {
              "invitation_expires_at": string,"invitation_id": string,"invitation_token": string
            }[]
                           },
"create_workflow":
{ Args: { "config": Json,"design": Json,"organization_id": string,"schema_version"?: number,"source_prompt"?: string,"template_key"?: string }; Returns: {
              "created_at": string,
"created_by": string,
"deleted_at": string | null,
"draft_config": NonNullable<Json>,
"draft_design": NonNullable<Json>,
"id": string,
"intake": NonNullable<Json>,
"lock_version": number,
"organization_id": string,
"public_slug": string,
"published_lock_version": number | null,
"published_version_id": string | null,
"schema_version": number,
"source_prompt": string | null,
"status": string,
"template_key": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workflows"
        isOneToOne: false
        isSetofReturn: true
      } },
"delete_workflow":
{ Args: { "p_organization_id": string,"p_workflow_id": string }; Returns: undefined
                           },
"duplicate_workflow":
{ Args: { "organization_id": string,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
"deleted_at": string | null,
"draft_config": NonNullable<Json>,
"draft_design": NonNullable<Json>,
"id": string,
"intake": NonNullable<Json>,
"lock_version": number,
"organization_id": string,
"public_slug": string,
"published_lock_version": number | null,
"published_version_id": string | null,
"schema_version": number,
"source_prompt": string | null,
"status": string,
"template_key": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workflows"
        isOneToOne: false
        isSetofReturn: true
      } },
"is_platform_operator":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"issue_tracking_link":
{ Args: { "p_organization_id": string,"p_submission_id": string }; Returns: string
                           },
"list_team":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"my_access":
{ Args: Record<PropertyKey, never>; Returns: {
              "access": string,"organization_id": string,"role": string
            }[]
                           },
"operator_issue_password_recovery":
{ Args: { "p_email": string }; Returns: string
                           },
"operator_list_organizations":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"operator_set_tables_enabled":
{ Args: { "p_enabled": boolean,"p_organization_id": string }; Returns: Json
                           },
"owner_issue_staff_recovery":
{ Args: { "p_organization_id": string,"p_user_id": string }; Returns: string
                           },
"public_booking_availability":
{ Args: { "p_date": string,"p_slug": string }; Returns: Json
                           },
"public_cancel_request":
{ Args: { "p_token": string }; Returns: Json
                           },
"public_decide_quote":
{ Args: { "p_comment": string,"p_decision": string,"p_key": string,"p_quote_id": string,"p_selections": Json,"p_token": string }; Returns: Json
                           },
"public_intake_state":
{ Args: { "p_slug": string }; Returns: Json
                           },
"public_option_usage":
{ Args: { "p_slug": string }; Returns: Json
                           },
"public_request_tracking_token":
{ Args: { "p_client_token": string,"p_idempotency_key": string,"p_slug": string }; Returns: string
                           },
"public_respond_action":
{ Args: { "p_action_id": string,"p_option_id": string,"p_token": string }; Returns: Json
                           },
"public_track_request":
{ Args: { "p_token": string }; Returns: Json
                           },
"publish_workflow":
{ Args: { "engine_version"?: string,"expected_lock_version": number,"organization_id": string,"published_design": Json,"workflow_id": string }; Returns: {
              "config": NonNullable<Json>,
"created_at": string,
"design": NonNullable<Json>,
"engine_version": string,
"id": string,
"organization_id": string,
"published_by": string,
"schema_version": number,
"version_number": number,
"workflow_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workflow_versions"
        isOneToOne: false
        isSetofReturn: true
      } },
"register_organization_asset":
{ Args: { "p_height": number,"p_id": string,"p_kind": string,"p_mime": string,"p_name": string,"p_organization_id": string,"p_width": number }; Returns: {
              "bytes": number,
"created_at": string,
"created_by": string,
"height": number,
"id": string,
"kind": string,
"mime": string,
"name": string,
"organization_id": string,
"removed_at": string | null,
"width": number
            }[]
                          SetofOptions: {
        from: "*"
        to: "organization_assets"
        isOneToOne: false
        isSetofReturn: true
      } },
"remove_member":
{ Args: { "p_organization_id": string,"p_user_id": string }; Returns: undefined
                           },
"remove_organization_asset":
{ Args: { "p_id": string,"p_organization_id": string }; Returns: undefined
                           },
"resolve_public_workflow":
{ Args: { "p_slug": string }; Returns: Json
                           },
"restore_workflow_version":
{ Args: { "expected_lock_version": number,"organization_id": string,"version_id": string,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
"deleted_at": string | null,
"draft_config": NonNullable<Json>,
"draft_design": NonNullable<Json>,
"id": string,
"intake": NonNullable<Json>,
"lock_version": number,
"organization_id": string,
"public_slug": string,
"published_lock_version": number | null,
"published_version_id": string | null,
"schema_version": number,
"source_prompt": string | null,
"status": string,
"template_key": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workflows"
        isOneToOne: false
        isSetofReturn: true
      } },
"revoke_team_invitation":
{ Args: { "p_invitation_id": string,"p_organization_id": string }; Returns: undefined
                           },
"revoke_tracking_links":
{ Args: { "p_organization_id": string,"p_submission_id": string }; Returns: number
                           },
"save_quote_draft":
{ Args: { "p_content": Json,"p_expected_lock_version": number,"p_organization_id": string,"p_quote_id": string,"p_submission_id": string }; Returns: {
              "content": NonNullable<Json>,
"created_at": string,
"created_by": string,
"decided_at": string | null,
"decision": Json | null,
"decision_key": string | null,
"id": string,
"lock_version": number,
"organization_id": string,
"revision": number,
"sent_at": string | null,
"status": string,
"submission_id": string,
"total_minor": number,
"updated_at": string,
"valid_until": string | null,
"viewed_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "quotes"
        isOneToOne: false
        isSetofReturn: true
      } },
"save_workflow_draft":
{ Args: { "config": Json,"design": Json,"expected_lock_version": number,"organization_id": string,"schema_version"?: number,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
"deleted_at": string | null,
"draft_config": NonNullable<Json>,
"draft_design": NonNullable<Json>,
"id": string,
"intake": NonNullable<Json>,
"lock_version": number,
"organization_id": string,
"public_slug": string,
"published_lock_version": number | null,
"published_version_id": string | null,
"schema_version": number,
"source_prompt": string | null,
"status": string,
"template_key": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workflows"
        isOneToOne: false
        isSetofReturn: true
      } },
"send_quote":
{ Args: { "p_expected_lock_version": number,"p_organization_id": string,"p_quote_id": string }; Returns: {
              "content": NonNullable<Json>,
"created_at": string,
"created_by": string,
"decided_at": string | null,
"decision": Json | null,
"decision_key": string | null,
"id": string,
"lock_version": number,
"organization_id": string,
"revision": number,
"sent_at": string | null,
"status": string,
"submission_id": string,
"total_minor": number,
"updated_at": string,
"valid_until": string | null,
"viewed_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "quotes"
        isOneToOne: false
        isSetofReturn: true
      } },
"server_consume_password_recovery":
{ Args: { "recovery_token": string }; Returns: {
              "email": string,"user_id": string
            }[]
                           },
"server_create_owner_invitation":
{ Args: { "actor_user_id": string,"intended_email": string,"target_organization_id": string,"valid_for"?: string }; Returns: {
              "invitation_expires_at": string,"invitation_id": string,"invitation_token": string
            }[]
                           },
"server_create_owner_invitation_authorized":
{ Args: { "actor_user_id": string,"intended_email": string,"target_organization_id": string,"valid_for"?: string }; Returns: {
              "invitation_expires_at": string,"invitation_id": string,"invitation_token": string
            }[]
                           },
"server_expire_owner_invitations":
{ Args: { "actor_user_id": string,"target_organization_id"?: string }; Returns: number
                           },
"server_invitation_onboarding_target":
{ Args: { "expected_organization_id": string,"invitation_token": string }; Returns: {
              "account_exists": boolean,"email": string
            }[]
                           },
"server_prepare_account_deletion":
{ Args: { "p_user_id": string }; Returns: Json
                           },
"server_provision_organization_authorized":
{ Args: { "actor_user_id": string,"name": string,"owner_email": string,"slug": string }; Returns: {
              "invitation_expires_at": string,"invitation_token": string,"organization_id": string
            }[]
                           },
"server_revoke_owner_invitation":
{ Args: { "actor_user_id": string,"expected_organization_id": string,"reason": string,"target_invitation_id": string }; Returns: boolean
                           },
"set_invitation_access":
{ Args: { "p_access": string,"p_invitation_id": string,"p_organization_id": string }; Returns: undefined
                           },
"set_member_access":
{ Args: { "p_access": string,"p_organization_id": string,"p_user_id": string }; Returns: undefined
                           },
"set_workflow_archived":
{ Args: { "archived": boolean,"expected_lock_version": number,"organization_id": string,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
"deleted_at": string | null,
"draft_config": NonNullable<Json>,
"draft_design": NonNullable<Json>,
"id": string,
"intake": NonNullable<Json>,
"lock_version": number,
"organization_id": string,
"public_slug": string,
"published_lock_version": number | null,
"published_version_id": string | null,
"schema_version": number,
"source_prompt": string | null,
"status": string,
"template_key": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workflows"
        isOneToOne: false
        isSetofReturn: true
      } },
"submit_public_workflow":
{ Args: { "p_answers": Json,"p_client_token": string,"p_consent": boolean,"p_idempotency_key": string,"p_slug": string }; Returns: Json
                           },
"tables_add_note":
{ Args: { "p_body": string,"p_reservation_id": string,"p_visibility"?: string }; Returns: Json
                           },
"tables_analytics":
{ Args: { "p_from": string,"p_to": string,"p_venue_id": string }; Returns: Json
                           },
"tables_anonymize_guest":
{ Args: { "p_guest_id": string,"p_organization_id": string }; Returns: Json
                           },
"tables_assign_staff":
{ Args: { "p_role": string,"p_user_id": string,"p_venue_id": string }; Returns: Json
                           },
"tables_create_venue":
{ Args: { "p_name": string,"p_organization_id": string,"p_slug": string,"p_timezone"?: string }; Returns: Json
                           },
"tables_decide_pending":
{ Args: { "p_decision": string,"p_expected_lock_version": number,"p_reason"?: string,"p_reservation_id": string }; Returns: Json
                           },
"tables_delete_venue":
{ Args: { "p_confirm_name": string,"p_venue_id": string }; Returns: Json
                           },
"tables_export_guest":
{ Args: { "p_guest_id": string,"p_organization_id": string }; Returns: Json
                           },
"tables_find_guest":
{ Args: { "p_organization_id": string,"p_phone": string }; Returns: Json
                           },
"tables_get_venue":
{ Args: { "p_venue_id": string }; Returns: Json
                           },
"tables_list_staff":
{ Args: { "p_venue_id": string }; Returns: Json
                           },
"tables_list_venues":
{ Args: { "p_organization_id": string }; Returns: Json
                           },
"tables_menu_archive":
{ Args: { "p_menu_id": string }; Returns: undefined
                           },
"tables_menu_create":
{ Args: { "p_title": string,"p_venue_id": string }; Returns: Json
                           },
"tables_menu_list":
{ Args: { "p_venue_id": string }; Returns: Json
                           },
"tables_menu_publish":
{ Args: { "p_expected_lock_version": number,"p_menu_id": string }; Returns: Json
                           },
"tables_menu_save":
{ Args: { "p_doc": Json,"p_expected_lock_version": number,"p_menu_id": string,"p_title": string }; Returns: Json
                           },
"tables_move":
{ Args: { "p_expected_lock_version": number,"p_reason"?: string,"p_reservation_id": string,"p_table_ids": (string)[] }; Returns: Json
                           },
"tables_public_availability":
{ Args: { "p_client": string,"p_date": string,"p_party": number,"p_slug": string,"p_zone": string }; Returns: Json
                           },
"tables_public_book":
{ Args: { "p_client": string,"p_idempotency_key": string,"p_input": Json,"p_slug": string }; Returns: Json
                           },
"tables_public_cancel":
{ Args: { "p_client": string,"p_token": string }; Returns: Json
                           },
"tables_public_manage":
{ Args: { "p_client": string,"p_token": string }; Returns: Json
                           },
"tables_public_menus":
{ Args: { "p_slug": string }; Returns: Json
                           },
"tables_public_modify":
{ Args: { "p_client": string,"p_expected_lock_version": number,"p_input": Json,"p_token": string }; Returns: Json
                           },
"tables_public_modify_options":
{ Args: { "p_client": string,"p_date": string,"p_party": number,"p_token": string }; Returns: Json
                           },
"tables_public_venue":
{ Args: { "p_slug": string }; Returns: Json
                           },
"tables_public_waitlist_join":
{ Args: { "p_client": string,"p_idempotency_key": string,"p_input": Json,"p_slug": string }; Returns: Json
                           },
"tables_public_waitlist_leave":
{ Args: { "p_client": string,"p_token": string }; Returns: Json
                           },
"tables_public_waitlist_status":
{ Args: { "p_client": string,"p_token": string }; Returns: Json
                           },
"tables_publish_venue":
{ Args: { "p_expected_lock_version": number,"p_venue_id": string }; Returns: Json
                           },
"tables_reservation_detail":
{ Args: { "p_reservation_id": string }; Returns: Json
                           },
"tables_save_draft":
{ Args: { "p_draft": Json,"p_expected_lock_version": number,"p_venue_id": string }; Returns: Json
                           },
"tables_set_exception":
{ Args: { "p_date": string,"p_kind": string,"p_note": string,"p_service_key"?: string,"p_venue_id": string }; Returns: Json
                           },
"tables_set_table_state":
{ Args: { "p_reason": string,"p_service_date": string,"p_state": string,"p_table_id": string,"p_venue_id": string }; Returns: Json
                           },
"tables_set_venue_status":
{ Args: { "p_status": string,"p_venue_id": string }; Returns: Json
                           },
"tables_shift":
{ Args: { "p_service_date": string,"p_venue_id": string }; Returns: Json
                           },
"tables_staff_availability":
{ Args: { "p_date": string,"p_party": number,"p_venue_id": string,"p_zone"?: string }; Returns: Json
                           },
"tables_staff_create_reservation":
{ Args: { "p_idempotency_key": string,"p_input": Json,"p_venue_id": string }; Returns: Json
                           },
"tables_staff_update_reservation":
{ Args: { "p_expected_lock_version": number,"p_input": Json,"p_reservation_id": string }; Returns: Json
                           },
"tables_transition":
{ Args: { "p_action": string,"p_expected_lock_version": number,"p_reason"?: string,"p_reservation_id": string }; Returns: Json
                           },
"tables_waitlist":
{ Args: { "p_service_date": string,"p_venue_id": string }; Returns: Json
                           },
"tables_waitlist_add":
{ Args: { "p_idempotency_key": string,"p_input": Json,"p_venue_id": string }; Returns: Json
                           },
"tables_waitlist_close":
{ Args: { "p_entry_id": string,"p_expected_lock_version": number,"p_status": string }; Returns: Json
                           },
"tables_waitlist_offer":
{ Args: { "p_entry_id": string,"p_expected_lock_version": number,"p_table_ids": (string)[] }; Returns: Json
                           },
"tables_waitlist_priority":
{ Args: { "p_entry_id": string,"p_expected_lock_version": number,"p_priority": number,"p_reason": string }; Returns: Json
                           },
"tables_waitlist_seat":
{ Args: { "p_entry_id": string,"p_expected_lock_version": number,"p_table_ids": (string)[] }; Returns: Json
                           },
"transition_submission_status":
{ Args: { "p_expected_lock_version": number,"p_message"?: string,"p_organization_id": string,"p_submission_id": string,"p_to_status": string }; Returns: {
              "answers": NonNullable<Json>,
"created_at": string,
"currency": string,
"id": string,
"idempotency_key": string,
"lock_version": number,
"organization_id": string,
"public_client_token": string,
"request_hash": string,
"status": string,
"total_minor": number,
"updated_at": string,
"workflow_id": string,
"workflow_version_id": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "submissions"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_organization_profile":
{ Args: { "p_contact_email": string,"p_name": string,"p_organization_id": string,"p_primary_color": string,"p_tagline": string }; Returns: {
              "created_at": string,
"id": string,
"name": string,
"slug": string,
"status": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "organizations"
        isOneToOne: false
        isSetofReturn: true
      } },
"update_workflow_intake":
{ Args: { "expected_lock_version": number,"intake": Json,"organization_id": string,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
"deleted_at": string | null,
"draft_config": NonNullable<Json>,
"draft_design": NonNullable<Json>,
"id": string,
"intake": NonNullable<Json>,
"lock_version": number,
"organization_id": string,
"public_slug": string,
"published_lock_version": number | null,
"published_version_id": string | null,
"schema_version": number,
"source_prompt": string | null,
"status": string,
"template_key": string,
"updated_at": string
            }[]
                          SetofOptions: {
        from: "*"
        to: "workflows"
        isOneToOne: false
        isSetofReturn: true
      } },
"withdraw_quote":
{ Args: { "p_organization_id": string,"p_quote_id": string }; Returns: {
              "content": NonNullable<Json>,
"created_at": string,
"created_by": string,
"decided_at": string | null,
"decision": Json | null,
"decision_key": string | null,
"id": string,
"lock_version": number,
"organization_id": string,
"revision": number,
"sent_at": string | null,
"status": string,
"submission_id": string,
"total_minor": number,
"updated_at": string,
"valid_until": string | null,
"viewed_at": string | null
            }[]
                          SetofOptions: {
        from: "*"
        to: "quotes"
        isOneToOne: false
        isSetofReturn: true
      } }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {

          }
        }
} as const
