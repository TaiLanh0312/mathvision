package com.geopro.mathvision;

import android.content.Intent;
import android.util.Base64;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.ActivityCallback;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DocumentScanner")
public class GoogleDocumentScannerPlugin extends Plugin {
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void scan(PluginCall call) {
        Intent intent = new Intent(getContext(), GoogleDocumentScannerActivity.class);
        startActivityForResult(call, intent, "onScannerActivityResult");
    }

    @ActivityCallback
    private void onScannerActivityResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getResultCode() != android.app.Activity.RESULT_OK) {
            JSObject cancelled = new JSObject();
            cancelled.put("cancelled", true);
            call.resolve(cancelled);
            return;
        }

        Intent data = result.getData();
        if (data == null) {
            call.reject("Google Scanner không trả về ảnh.");
            return;
        }
        String scannerError = data.getStringExtra("scannerError");
        if (scannerError != null) {
            call.reject(scannerError);
            return;
        }
        ArrayList<String> paths = data.getStringArrayListExtra("scannedImages");
        if (paths == null || paths.isEmpty()) {
            call.reject("Không có trang ảnh nào được quét.");
            return;
        }

        io.execute(() -> {
            try {
                JSArray images = new JSArray();
                for (String path : paths) {
                    File file = new File(path);
                    byte[] bytes;
                    try (InputStream input = new FileInputStream(file);
                         ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                        byte[] buffer = new byte[8192];
                        int count;
                        while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                        bytes = output.toByteArray();
                    }
                    images.put("data:image/jpeg;base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
                    //noinspection ResultOfMethodCallIgnored
                    file.delete();
                }
                JSObject response = new JSObject();
                response.put("cancelled", false);
                response.put("images", images);
                call.resolve(response);
            } catch (Exception e) {
                call.reject("Không đọc được ảnh đã quét: " + e.getMessage(), e);
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        io.shutdown();
    }
}
