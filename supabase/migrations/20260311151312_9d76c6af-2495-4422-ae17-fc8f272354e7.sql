ALTER TABLE job_messages DROP CONSTRAINT job_messages_sender_id_fkey;
ALTER TABLE job_messages ADD CONSTRAINT job_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id);