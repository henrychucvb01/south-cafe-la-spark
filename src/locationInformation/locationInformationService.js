import { supabase } from "../supabaseClient";

export const LOCATION_INFORMATION_FIELDS = [
  "id",
  "location_code",
  "school_name",
  "address",
  "manager_name",
  "site_type",
  "counting_claiming",
  "cafeteria_phone",
  "school_phone",
  "school_photo_url",
  "manager_photo_url",
  "school_logo_url",
  "latitude",
  "longitude",
  "cpm_name",
  "cpm_office_phone",
  "cpm_cell_phone",
  "cpm_email",
  "supervisor_id",
  "updated_at",
].join(",");

export async function loadLocationDirectory() {
  const { data, error } = await supabase
    .from("location_information")
    .select(LOCATION_INFORMATION_FIELDS)
    .eq("active", true)
    .order("school_name");

  if (error) throw error;
  return data || [];
}

export async function loadAreaSupervisor() {
  const { data, error } = await supabase
    .from("area_supervisors")
    .select("id,full_name,email,cell_phone,auth_user_id")
    .eq("active", true)
    .order("id")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function saveLocationInformation(record, supervisorPin) {
  const { data, error } = await supabase.rpc("update_location_information", {
    p_supervisor_pin: supervisorPin,
    p_id: record.id,
    p_location_code: record.location_code || null,
    p_school_name: record.school_name,
    p_address: record.address || null,
    p_manager_name: record.manager_name || null,
    p_site_type: record.site_type || null,
    p_counting_claiming: record.counting_claiming || null,
    p_cafeteria_phone: record.cafeteria_phone || null,
    p_school_phone: record.school_phone || null,
    p_cpm_name: record.cpm_name || null,
    p_cpm_office_phone: record.cpm_office_phone || null,
    p_cpm_cell_phone: record.cpm_cell_phone || null,
    p_cpm_email: record.cpm_email || null,
  });

  if (error) throw error;
  return data;
}

export function filterLocationDirectory(records, query) {
  const terms = String(query || "")
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!terms.length) return records;

  return records.filter((record) => {
    const searchable = [
      record.location_code,
      record.school_name,
      record.manager_name,
      record.site_type,
      record.counting_claiming,
      record.cpm_name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}

export function formatLocationUpdatedAt(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
