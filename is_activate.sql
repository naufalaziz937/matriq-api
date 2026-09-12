-- Jalankan hanya jika kolom is_activate belum ada:
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_activate BOOLEAN NOT NULL DEFAULT FALSE;

-- Cek user:
SELECT
  user_id,
  nama,
  email,
  is_activate
FROM users
ORDER BY user_id;

-- Contoh kalau mau tandai user tertentu sudah selesai onboarding:
-- UPDATE users
-- SET is_activate = TRUE
-- WHERE user_id = 4;
