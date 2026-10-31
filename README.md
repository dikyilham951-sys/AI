# AI Agent Lokal

Aplikasi chat AI sederhana untuk dijalankan di komputer sendiri.

## Yang digunakan

- HTML, CSS, JavaScript: tampilan aplikasi.
- Node.js + Express: backend.
- SQLite: menyimpan akun dan riwayat chat.
- bcrypt: mengubah password menjadi hash satu arah dengan salt acak.
- Ollama + Qwen3 1.7B: model AI lokal melalui HTTP API.

Password tidak dikirim ke model AI. Browser hanya menampilkan password sebagai titik-titik; backend memproses password dengan bcrypt dan hanya menyimpan hash ke database. Hash tidak bisa dipakai untuk membaca kembali password asli.

## Persiapan

1. Pasang Node.js versi 20 atau lebih baru.
2. Pasang Ollama di komputer.
3. Buka Terminal / PowerShell, lalu unduh model:

   ```bash
   ollama pull qwen3:1.7b
   ```

   Model ini sekitar 1,4 GB. Ollama harus aktif ketika aplikasi dipakai.

4. Ekstrak folder proyek ini. Buka terminal di dalam folder `agent_ai_lokal`.
5. Pasang dependensi:

   ```bash
   npm install
   ```

6. Jalankan aplikasi:

   ```bash
   npm start
   ```

7. Buka alamat ini di browser komputer:

   ```text
   http://localhost:3000
   ```

8. Pilih **Daftar** untuk membuat akun, lalu login dan mulai chat.

## Pengaturan model

Secara default server memakai model `qwen3:1.7b` dan alamat API lokal `http://127.0.0.1:11434/api/chat`.

Untuk mengganti model, buat salinan `.env.example` bernama `.env`, lalu ubah `OLLAMA_MODEL` ke nama model yang sudah diunduh.

## Database

Database dibuat otomatis di `data/agent.sqlite`. Struktur SQL bisa dilihat di `schema.sql`.

Tabel `users` menyimpan `password_hash`, bukan password asli. Tabel `messages` menyimpan percakapan berdasarkan ID akun.

## Batasan dan keamanan

- Ini proyek lokal untuk belajar dan penggunaan pribadi, bukan aplikasi produksi yang sudah diaudit.
- Server hanya bind ke `127.0.0.1`; perangkat lain tidak bisa mengaksesnya melalui jaringan.
- Jangan unggah folder `data`, file `.env`, atau database berisi akun/chat ke internet.
- Jika aplikasi kelak dipasang online, wajib gunakan HTTPS, tinjau ulang konfigurasi sesi, tambahkan proteksi operasional, dan lakukan audit keamanan sebelum menerima akun orang lain.
- Gunakan password unik khusus aplikasi ini. Jangan masukkan password akun utama, email, atau game.
- AI lokal tidak otomatis bisa mengendalikan komputer atau membuka internet. Versi ini adalah asisten percakapan dengan riwayat chat.
