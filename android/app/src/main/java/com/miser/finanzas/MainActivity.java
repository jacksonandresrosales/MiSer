package com.miser.finanzas;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(MiSerUpdaterPlugin.class);
        registerPlugin(MiSerSecurityPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
