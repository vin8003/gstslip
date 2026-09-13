-- Original uploaded files (photo/PDF), separate from extracted payload.
create table if not exists stored_invoice_files (
  invoice_id text not null,
  owner_key text not null,
  page_index integer not null,
  file_name text not null,
  mime_type text not null,
  byte_size integer not null,
  data_base64 text not null,
  primary key (invoice_id, owner_key, page_index)
);

create index if not exists stored_invoice_files_owner_idx
  on stored_invoice_files (owner_key, invoice_id);
