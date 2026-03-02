package com.kalynt.mobile.p2p

import android.app.NotificationManager as AndroidNotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.kalynt.mobile.KalyntApplication
import com.kalynt.mobile.MainActivity
import com.kalynt.mobile.R

/**
 * Handles notifications from desktop via WebSocket
 */
class DesktopNotificationManager(
    private val context: Context
) {
    private val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) 
        as AndroidNotificationManager

    /**
     * Handle incoming notification from desktop
     */
    fun handleDesktopNotification(notification: P2PMessage.PushNotification) {
        when (notification.type) {
            NotificationType.AGENT_COMPLETE -> showAgentCompleteNotification(notification)
            NotificationType.AGENT_ERROR -> showAgentErrorNotification(notification)
            NotificationType.PR_COMMENT -> showPRCommentNotification(notification)
            NotificationType.PR_APPROVED -> showPRApprovedNotification(notification)
            NotificationType.MERGE_CONFLICT -> showMergeConflictNotification(notification)
            NotificationType.CI_FAILED -> showCIFailedNotification(notification)
            NotificationType.WORKFLOW_COMPLETE -> showWorkflowCompleteNotification(notification)
        }
    }

    private fun showAgentCompleteNotification(notification: P2PMessage.PushNotification) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "agents")
        }
        
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, KalyntApplication.CHANNEL_AGENT)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .addAction(R.drawable.ic_view, "View", pendingIntent)

        notificationManager.notify(
            generateNotificationId(notification.data["commandId"]),
            builder.build()
        )
    }

    private fun showAgentErrorNotification(notification: P2PMessage.PushNotification) {
        val builder = NotificationCompat.Builder(context, KalyntApplication.CHANNEL_AGENT)
            .setSmallIcon(R.drawable.ic_error)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)

        notificationManager.notify(
            generateNotificationId("error_${System.currentTimeMillis()}"),
            builder.build()
        )
    }

    private fun showPRCommentNotification(notification: P2PMessage.PushNotification) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "github")
            putExtra("pr_number", notification.data["prNumber"])
        }
        
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, KalyntApplication.CHANNEL_GITHUB)
            .setSmallIcon(R.drawable.ic_github)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .addAction(R.drawable.ic_reply, "Reply", pendingIntent)

        notificationManager.notify(
            generateNotificationId("pr_${notification.data["prNumber"]}"),
            builder.build()
        )
    }

    private fun showPRApprovedNotification(notification: P2PMessage.PushNotification) {
        val builder = NotificationCompat.Builder(context, KalyntApplication.CHANNEL_GITHUB)
            .setSmallIcon(R.drawable.ic_check)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)

        notificationManager.notify(
            generateNotificationId("approve_${System.currentTimeMillis()}"),
            builder.build()
        )
    }

    private fun showMergeConflictNotification(notification: P2PMessage.PushNotification) {
        val builder = NotificationCompat.Builder(context, KalyntApplication.CHANNEL_GITHUB)
            .setSmallIcon(R.drawable.ic_warning)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setStyle(NotificationCompat.BigTextStyle().bigText(notification.body))

        notificationManager.notify(
            generateNotificationId("conflict_${notification.data["prNumber"]}"),
            builder.build()
        )
    }

    private fun showCIFailedNotification(notification: P2PMessage.PushNotification) {
        val builder = NotificationCompat.Builder(context, KalyntApplication.CHANNEL_GITHUB)
            .setSmallIcon(R.drawable.ic_error)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)

        notificationManager.notify(
            generateNotificationId("ci_${System.currentTimeMillis()}"),
            builder.build()
        )
    }

    private fun showWorkflowCompleteNotification(notification: P2PMessage.PushNotification) {
        val builder = NotificationCompat.Builder(context, KalyntApplication.CHANNEL_AGENT)
            .setSmallIcon(R.drawable.ic_workflow)
            .setContentTitle(notification.title)
            .setContentText(notification.body)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)

        notificationManager.notify(
            generateNotificationId("workflow_${notification.data["workflowId"]}"),
            builder.build()
        )
    }

    private fun generateNotificationId(key: String?): Int {
        return key?.hashCode() ?: System.currentTimeMillis().toInt()
    }
}