/**
 * Dive log backend configuration. Fill in after creating the Supabase project
 * (see supabase/README.md). The anon key is public by design; security comes
 * from the database rules. Never put the service role key here.
 */
export const SUPABASE_URL = 'https://lencvgxjqodhvgaziozr.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_oZwZubI38f4uq1_WGs9XVw_eRPqi2kr';

/**
 * Mapy.com (Seznam.cz) REST API key for map tiles and place search in the logbook
 * site picker. Public by design (it ships in the page): restrict it by HTTP referrer
 * in the Mapy developer portal (https://developer.mapy.com). Leave empty to use
 * OpenStreetMap tiles and Nominatim search only.
 */
export const MAPY_API_KEY = 'hBKGazzcJwbaw4xYumPCvWKkHEY6_TI41JtyhGHFuNs';
