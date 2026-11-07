
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
                },"organization_memberships": {
                  Row: {
                    "created_at": string,"organization_id": string,"role": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"role": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"role"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
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
                },"submission_events": {
                  Row: {
                    "actor_user_id": string | null,"created_at": string,"event_type": string,"id": string,"organization_id": string,"submission_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_user_id"?: string | null,"created_at"?: string,"event_type": string,"id"?: string,"organization_id": string,"submission_id": string
                  }
                  Update: {
                    "actor_user_id"?: string | null,"created_at"?: string,"event_type"?: string,"id"?: string,"organization_id"?: string,"submission_id"?: string
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
                    "created_at": string,"created_by": string,"draft_config": NonNullable<Json>,"draft_design": NonNullable<Json>,"id": string,"intake": NonNullable<Json>,"lock_version": number,"organization_id": string,"public_slug": string,"published_lock_version": number | null,"published_version_id": string | null,"schema_version": number,"source_prompt": string | null,"status": string,"template_key": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string,"draft_config": NonNullable<Json>,"draft_design"?: NonNullable<Json>,"id"?: string,"intake"?: NonNullable<Json>,"lock_version"?: number,"organization_id": string,"public_slug": string,"published_lock_version"?: number | null,"published_version_id"?: string | null,"schema_version": number,"source_prompt"?: string | null,"status"?: string,"template_key"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"draft_config"?: NonNullable<Json>,"draft_design"?: NonNullable<Json>,"id"?: string,"intake"?: NonNullable<Json>,"lock_version"?: number,"organization_id"?: string,"public_slug"?: string,"published_lock_version"?: number | null,"published_version_id"?: string | null,"schema_version"?: number,"source_prompt"?: string | null,"status"?: string,"template_key"?: string,"updated_at"?: string
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
"create_workflow":
{ Args: { "config": Json,"design": Json,"organization_id": string,"schema_version"?: number,"source_prompt"?: string,"template_key"?: string }; Returns: {
              "created_at": string,
"created_by": string,
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
"duplicate_workflow":
{ Args: { "organization_id": string,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
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
"public_booking_availability":
{ Args: { "p_date": string,"p_slug": string }; Returns: Json
                           },
"public_intake_state":
{ Args: { "p_slug": string }; Returns: Json
                           },
"public_option_usage":
{ Args: { "p_slug": string }; Returns: Json
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
"resolve_public_workflow":
{ Args: { "p_slug": string }; Returns: Json
                           },
"restore_workflow_version":
{ Args: { "expected_lock_version": number,"organization_id": string,"version_id": string,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
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
"save_workflow_draft":
{ Args: { "config": Json,"design": Json,"expected_lock_version": number,"organization_id": string,"schema_version"?: number,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
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
"server_provision_organization_authorized":
{ Args: { "actor_user_id": string,"name": string,"owner_email": string,"slug": string }; Returns: {
              "invitation_expires_at": string,"invitation_token": string,"organization_id": string
            }[]
                           },
"server_revoke_owner_invitation":
{ Args: { "actor_user_id": string,"expected_organization_id": string,"reason": string,"target_invitation_id": string }; Returns: boolean
                           },
"set_workflow_archived":
{ Args: { "archived": boolean,"expected_lock_version": number,"organization_id": string,"workflow_id": string }; Returns: {
              "created_at": string,
"created_by": string,
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
"transition_submission_status":
{ Args: { "p_expected_lock_version": number,"p_organization_id": string,"p_submission_id": string,"p_to_status": string }; Returns: {
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
