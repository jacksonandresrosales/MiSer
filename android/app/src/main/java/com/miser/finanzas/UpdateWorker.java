package com.miser.finanzas;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;
import java.util.concurrent.TimeUnit;

public class UpdateWorker extends Worker {
    static final String CHANNEL_ID = "miser_updates";
    private static final String WORK_NAME = "miser_update_check";
    private static final int NOTIFICATION_ID = 7401;

    public UpdateWorker(@NonNull Context context, @NonNull WorkerParameters parameters) {
        super(context, parameters);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("miser_updater", Context.MODE_PRIVATE);
    }

    static boolean backgroundEnabled(Context context) {
        return preferences(context).getBoolean("background_enabled", false);
    }

    static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                "Actualizaciones de MiSer", NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Avisos cuando hay una nueva versión de MiSer");
            context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }

    static boolean notificationsEnabled(Context context) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context,
            Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel channel = context.getSystemService(NotificationManager.class)
                .getNotificationChannel(CHANNEL_ID);
            if (channel == null || channel.getImportance() == NotificationManager.IMPORTANCE_NONE) return false;
            if (Build.VERSION.SDK_INT >= 28 && channel.getGroup() != null) {
                android.app.NotificationChannelGroup group = context.getSystemService(NotificationManager.class)
                    .getNotificationChannelGroup(channel.getGroup());
                if (group != null && group.isBlocked()) return false;
            }
        }
        return true;
    }

    static synchronized void configure(Context context, boolean enabled) {
        preferences(context).edit().putBoolean("background_enabled", enabled).apply();
        schedule(context);
        if (!enabled) NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID);
    }

    static synchronized void schedule(Context context) {
        WorkManager manager = WorkManager.getInstance(context);
        if (!backgroundEnabled(context)) {
            manager.cancelUniqueWork(WORK_NAME);
            return;
        }
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(UpdateWorker.class, 6, TimeUnit.HOURS)
            .setInitialDelay(6, TimeUnit.HOURS)
            .setConstraints(new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build();
        // KEEP preserves the next run on every app launch. Android can defer runs beyond six hours.
        manager.enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        ensureChannel(context);
        if (isStopped() || !backgroundEnabled(context) || !notificationsEnabled(context)) return Result.success();
        try {
            UpdateMetadata update = UpdateClient.check();
            synchronized (UpdateWorker.class) {
                if (isStopped() || !backgroundEnabled(context) || !notificationsEnabled(context)
                    || !update.isNewerThan(UpdateClient.versionCode(UpdateClient.installed(context)))
                    || update.versionCode <= preferences(context).getInt("last_notified_version", 0)) {
                    return Result.success();
                }
                Intent intent = new Intent(context, MainActivity.class)
                    .setAction("com.miser.finanzas.OPEN_UPDATE")
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
                PendingIntent click = PendingIntent.getActivity(context, 0, intent,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                Bundle extras = new Bundle();
                extras.putInt("miser_update_version", update.versionCode);
                NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle("MiSer " + update.versionName + " disponible")
                    .setContentText("Abre MiSer para revisar e instalar la actualización.")
                    .setContentIntent(click).setAutoCancel(true).setOnlyAlertOnce(true).setExtras(extras);
                NotificationManager manager = context.getSystemService(NotificationManager.class);
                manager.notify(NOTIFICATION_ID, notification.build());
                // notify() is void: only record when the system actually exposes the posted notification.
                if (notificationsEnabled(context)) {
                    for (android.service.notification.StatusBarNotification posted : manager.getActiveNotifications()) {
                        if (posted.getId() == NOTIFICATION_ID
                            && posted.getNotification().extras.getInt("miser_update_version", 0) == update.versionCode) {
                            preferences(context).edit().putInt("last_notified_version", update.versionCode).commit();
                            break;
                        }
                    }
                }
            }
        } catch (Exception ignored) {
            // The next periodic run checks again; never download or create an immediate retry loop.
        }
        return Result.success();
    }
}
