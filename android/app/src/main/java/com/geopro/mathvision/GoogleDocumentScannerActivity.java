package com.geopro.mathvision;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.gms.mlkit.documentscanner.GmsDocumentScanner;
import com.google.android.gms.mlkit.documentscanner.GmsDocumentScannerOptions;
import com.google.android.gms.mlkit.documentscanner.GmsDocumentScanning;
import com.google.android.gms.mlkit.documentscanner.GmsDocumentScanningResult;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

public class GoogleDocumentScannerActivity extends AppCompatActivity {
    private ActivityResultLauncher<IntentSenderRequest> scannerLauncher;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        scannerLauncher = registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), result -> {
                if (result.getResultCode() != RESULT_OK) {
                    setResult(RESULT_CANCELED);
                    finish();
                    return;
                }
                try {
                    GmsDocumentScanningResult scan = GmsDocumentScanningResult.fromActivityResultIntent(result.getData());
                    ArrayList<String> paths = new ArrayList<>();
                    if (scan != null && scan.getPages() != null) {
                        for (GmsDocumentScanningResult.Page page : scan.getPages()) {
                            paths.add(copyPageToCache(page.getImageUri()));
                        }
                    }
                    if (paths.isEmpty()) throw new IllegalStateException("Không có trang ảnh nào được quét.");
                    Intent output = new Intent();
                    output.putStringArrayListExtra("scannedImages", paths);
                    setResult(RESULT_OK, output);
                } catch (Exception e) {
                    Intent output = new Intent();
                    output.putExtra("scannerError", e.getMessage() == null ? "Không xử lý được ảnh quét." : e.getMessage());
                    setResult(RESULT_OK, output);
                }
                finish();
            }
        );

        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)
            .setPageLimit(6)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();
        GmsDocumentScanner scanner = GmsDocumentScanning.getClient(options);
        scanner.getStartScanIntent(this)
            .addOnSuccessListener(sender -> scannerLauncher.launch(new IntentSenderRequest.Builder(sender).build()))
            .addOnFailureListener(error -> {
                Intent output = new Intent();
                output.putExtra("scannerError", "Không mở được Google Document Scanner. Hãy cập nhật Google Play services rồi thử lại. " + error.getMessage());
                setResult(RESULT_OK, output);
                finish();
            });
    }

    private String copyPageToCache(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            if (stream == null) throw new IllegalStateException("Không mở được trang ảnh đã quét.");
            BitmapFactory.decodeStream(stream, null, bounds);
        }
        int sample = 1;
        while (Math.max(bounds.outWidth / sample, bounds.outHeight / sample) > 2200) sample *= 2;
        BitmapFactory.Options decode = new BitmapFactory.Options();
        decode.inSampleSize = sample;
        Bitmap bitmap;
        try (InputStream stream = getContentResolver().openInputStream(uri)) {
            if (stream == null) throw new IllegalStateException("Không mở lại được trang ảnh đã quét.");
            bitmap = BitmapFactory.decodeStream(stream, null, decode);
        }
        if (bitmap == null) throw new IllegalStateException("Ảnh quét không đọc được.");

        File output = File.createTempFile("mathvision-scan-", ".jpg", getCacheDir());
        try (FileOutputStream stream = new FileOutputStream(output)) {
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, stream);
        } finally {
            bitmap.recycle();
        }
        return output.getAbsolutePath();
    }
}
