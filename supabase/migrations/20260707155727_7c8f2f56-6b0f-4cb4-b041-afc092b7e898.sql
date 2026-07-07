create or replace function public.match_parcel_debug(
  _county_fips text,
  _apn text,
  _address text,
  _city text default null
) returns table(parcel_id uuid, method text)
language plpgsql
stable
set search_path = public
as $$
declare
  _id uuid;
begin
  if _apn is not null and _county_fips is not null then
    select id into _id from public.parcels
      where county_fips = _county_fips and apn = _apn limit 1;
    if _id is not null then
      parcel_id := _id; method := 'apn_county'; return next; return;
    end if;
  end if;

  if _address is not null and _county_fips is not null then
    select id into _id from public.parcels
      where county_fips = _county_fips
        and public.normalize_address_full(address) = public.normalize_address_full(_address)
      limit 1;
    if _id is not null then
      parcel_id := _id; method := 'addr_county'; return next; return;
    end if;
  end if;

  if _address is not null and _city is not null then
    select id into _id from public.parcels
      where public.normalize_address_full(address) = public.normalize_address_full(_address)
        and upper(city) = upper(_city)
      limit 1;
    if _id is not null then
      parcel_id := _id; method := 'addr_city'; return next; return;
    end if;
  end if;

  parcel_id := null; method := null; return next;
end $$;

grant execute on function public.match_parcel_debug(text, text, text, text) to authenticated, service_role;