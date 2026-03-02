package com.kalynt.mobile.p2p

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
sealed class P2PMessage {
    
    @Serializable
    @SerialName("desktop_info")
    data class DesktopInfo(
        val ip: String,
        val port: Int,
        val version: String,
        val deviceName: String
    ) : P2PMessage()
    
    @Serializable
    @SerialName("execute_command")
    data class ExecuteCommand(
        val requestId: String,
        val agentId: String,
        val command: String,
        val params: Map<String, String> = emptyMap()
    ) : P2PMessage()
    
    @Serializable
    @SerialName("command_response")
    data class CommandResponse(
        val requestId: String,
        val status: CommandStatus,
        val result: JsonElement? = null,
        val error: String? = null,
        val executionTimeMs: Long = 0
    ) : P2PMessage()
    
    @Serializable
    @SerialName("agent_status")
    data class AgentStatus(
        val agentId: String,
        val state: AgentState,
        val currentTask: String? = null,
        val queueLength: Int = 0,
        val capabilities: List<String> = emptyList()
    ) : P2PMessage()
    
    @Serializable
    @SerialName("workflow_update")
    data class WorkflowUpdate(
        val workflowId: String,
        val name: String,
        val step: Int,
        val totalSteps: Int,
        val status: WorkflowStatus,
        val logs: List<String> = emptyList()
    ) : P2PMessage()
    
    @Serializable
    @SerialName("workflow_create")
    data class WorkflowCreate(
        val requestId: String,
        val name: String,
        val steps: List<WorkflowStep>
    ) : P2PMessage()
    
    @Serializable
    @SerialName("push_notification")
    data class PushNotification(
        val title: String,
        val body: String,
        val type: NotificationType,
        val data: Map<String, String> = emptyMap(),
        val timestamp: Long = System.currentTimeMillis()
    ) : P2PMessage()
    
    @Serializable
    @SerialName("github_request")
    data class GitHubRequest(
        val requestId: String,
        val endpoint: String,
        val method: String = "GET",
        val body: JsonElement? = null
    ) : P2PMessage()
    
    @Serializable
    @SerialName("github_response")
    data class GitHubResponse(
        val requestId: String,
        val statusCode: Int,
        val body: JsonElement? = null,
        val error: String? = null
    ) : P2PMessage()
    
    @Serializable
    @SerialName("ping")
    object Ping : P2PMessage()
    
    @Serializable
    @SerialName("pong")
    data class Pong(
        val timestamp: Long
    ) : P2PMessage()
    
    @Serializable
    @SerialName("error")
    data class Error(
        val code: String,
        val message: String
    ) : P2PMessage()
}

@Serializable
enum class CommandStatus {
    @SerialName("pending") PENDING,
    @SerialName("running") RUNNING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED
}

@Serializable
enum class AgentState {
    @SerialName("idle") IDLE,
    @SerialName("busy") BUSY,
    @SerialName("offline") OFFLINE,
    @SerialName("error") ERROR
}

@Serializable
enum class WorkflowStatus {
    @SerialName("pending") PENDING,
    @SerialName("running") RUNNING,
    @SerialName("completed") COMPLETED,
    @SerialName("failed") FAILED,
    @SerialName("cancelled") CANCELLED
}

@Serializable
enum class NotificationType {
    @SerialName("agent_complete") AGENT_COMPLETE,
    @SerialName("agent_error") AGENT_ERROR,
    @SerialName("pr_comment") PR_COMMENT,
    @SerialName("pr_approved") PR_APPROVED,
    @SerialName("merge_conflict") MERGE_CONFLICT,
    @SerialName("ci_failed") CI_FAILED,
    @SerialName("workflow_complete") WORKFLOW_COMPLETE
}

@Serializable
data class WorkflowStep(
    val agentId: String,
    val command: String,
    val description: String,
    val params: Map<String, String> = emptyMap()
)

@Serializable
data class PullRequestInfo(
    val number: Int,
    val title: String,
    val author: String,
    val branch: String,
    val status: PRStatus,
    val isMergeable: Boolean? = null,
    val hasConflicts: Boolean = false,
    val checksStatus: ChecksStatus = ChecksStatus.PENDING
)

@Serializable
enum class PRStatus {
    @SerialName("open") OPEN,
    @SerialName("closed") CLOSED,
    @SerialName("merged") MERGED
}

@Serializable
enum class ChecksStatus {
    @SerialName("pending") PENDING,
    @SerialName("passing") PASSING,
    @SerialName("failing") FAILING
}