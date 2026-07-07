
create or replace function public.normalize_address(_addr text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    trim(regexp_replace(
      regexp_replace(
        upper(coalesce(_addr, '')),
        '[\.,#]', '', 'g'
      ),
      '\s+', ' ', 'g'
    )),
    ''
  )
$$;

-- Cheap suffix normalizer applied AFTER the base normalize.
create or replace function public.normalize_address_full(_addr text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  public.normalize_address(_addr),
                  '\mSTREET\M', 'ST', 'g'),
                '\mAVENUE\M', 'AVE', 'g'),
              '\mBOULEVARD\M', 'BLVD', 'g'),
            '\mROAD\M', 'RD', 'g'),
          '\mDRIVE\M', 'DR', 'g'),
        '\mLANE\M', 'LN', 'g'),
      '\mCOURT\M', 'CT', 'g'),
    '\mPLACE\M', 'PL', 'g')
$$;

create index if not exists parcels_norm_addr_idx
  on public.parcels (county_fips, (public.normalize_address_full(address)));

create or replace function public.match_parcel(
  _county_fips text,
  _apn text,
  _address text,
  _city text default null
) returns uuid
language plpgsql
stable
set search_path = public
as $$
declare
  _id uuid;
begin
  -- 1. Exact APN + county
  if _apn is not null and _county_fips is not null then
    select id into _id from public.parcels
      where county_fips = _county_fips and apn = _apn
      limit 1;
    if _id is not null then return _id; end if;
  end if;

  -- 2. Normalized address (+ county) match
  if _address is not null and _county_fips is not null then
    select id into _id from public.parcels
      where county_fips = _county_fips
        and public.normalize_address_full(address) = public.normalize_address_full(_address)
      limit 1;
    if _id is not null then return _id; end if;
  end if;

  -- 3. Normalized address + city (no county) — helps NYC where recipes may not carry the FIPS
  if _address is not null and _city is not null then
    select id into _id from public.parcels
      where public.normalize_address_full(address) = public.normalize_address_full(_address)
        and upper(city) = upper(_city)
      limit 1;
    if _id is not null then return _id; end if;
  end if;

  return null;
end $$;

-- Seed demo recipes so "Run" works end-to-end out of the box.
insert into public.adapter_recipes (name, target_table, source_url, container_selector, fields, notes)
values
  (
    'Demo · books.toscrape (proves pipeline)',
    'parcels',
    'https://books.toscrape.com/catalogue/page-1.html',
    'article.product_pod',
    '[
      {"name":"title","selector":"h3 a","type":"text"},
      {"name":"title_url","selector":"h3 a","type":"url"},
      {"name":"price","selector":".price_color","type":"money"},
      {"name":"availability","selector":".availability","type":"text"}
    ]'::jsonb,
    'Demo recipe. Extracts 20 book rows so you can verify the end-to-end pipeline (probe → discover → run). No parcel matches (books are not real estate) — expect status PARTIAL.'
  ),
  (
    'Miami-Dade Clerk · Foreclosure calendar',
    'distress_events',
    'https://www2.miamidadeclerk.gov/officialrecords/StandardSearch.aspx',
    'table tr',
    '[
      {"name":"case_number","selector":"td:nth-child(1)","type":"text"},
      {"name":"case_number_url","selector":"td:nth-child(1) a","type":"url"},
      {"name":"filing_date","selector":"td:nth-child(2)","type":"date"},
      {"name":"party_name","selector":"td:nth-child(3)","type":"text"},
      {"name":"doc_type","selector":"td:nth-child(4)","type":"text"}
    ]'::jsonb,
    'Real target — Miami-Dade Clerk of Courts. May need Zyte browser tier (ASP.NET, __VIEWSTATE). Adjust selectors after first probe if the DOM has changed.'
  )
on conflict do nothing;
