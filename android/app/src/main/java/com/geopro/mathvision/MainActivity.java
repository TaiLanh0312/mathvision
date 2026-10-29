package com.geopro.mathvision;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(GoogleDocumentScannerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
