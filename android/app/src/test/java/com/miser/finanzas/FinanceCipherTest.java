package com.miser.finanzas;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import org.junit.Test;

public class FinanceCipherTest {
    @Test public void authenticatedEncryptionPreservesUnicodeAndRejectsTamperingAndOtherAccounts() throws Exception {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256);
        SecretKey key = generator.generateKey();
        byte[] plain = "{\"nombre\":\"André\",\"saldo\":106.90}".getBytes(StandardCharsets.UTF_8);
        byte[] first = FinanceCipher.seal("miser-pending-alice", plain, key);
        byte[] second = FinanceCipher.seal("miser-pending-alice", plain, key);
        assertFalse(Arrays.equals(first, second));
        assertArrayEquals(plain, FinanceCipher.open("miser-pending-alice", first, key));
        assertThrows(Exception.class, () -> FinanceCipher.open("miser-pending-bob", first, key));
        first[first.length - 1] ^= 1;
        assertThrows(Exception.class, () -> FinanceCipher.open("miser-pending-alice", first, key));
        assertThrows(Exception.class, () -> FinanceCipher.open("miser-pending-alice", new byte[28], key));
        second[0] = 2;
        assertThrows(Exception.class, () -> FinanceCipher.open("miser-pending-alice", second, key));
    }
}
