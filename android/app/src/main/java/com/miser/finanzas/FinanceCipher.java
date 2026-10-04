package com.miser.finanzas;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Storage format shared by the native vault and its JVM regression test. */
final class FinanceCipher {
    static final int MAX_BYTES = 32 * 1024 * 1024;

    static byte[] seal(String name, byte[] plain, SecretKey key) throws Exception {
        if (plain.length > MAX_BYTES) throw new IllegalArgumentException("Recovery too large");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        byte[] encrypted = cipher.doFinal(plain);
        byte[] iv = cipher.getIV();
        if (iv.length != 12) throw new IllegalStateException("Unsupported IV");
        return ByteBuffer.allocate(13 + encrypted.length).put((byte) 1).put(iv).put(encrypted).array();
    }

    static byte[] open(String name, byte[] saved, SecretKey key) throws Exception {
        if (saved.length < 29 || saved.length > MAX_BYTES + 29 || saved[0] != 1) throw new IllegalArgumentException("Invalid recovery");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, saved, 1, 12));
        cipher.updateAAD(name.getBytes(StandardCharsets.UTF_8));
        return cipher.doFinal(saved, 13, saved.length - 13);
    }
}
