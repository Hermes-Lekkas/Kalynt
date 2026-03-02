package com.kalynt.mobile.github

import com.kalynt.mobile.p2p.ConnectionState
import com.kalynt.mobile.p2p.DesktopConnectionManager
import com.kalynt.mobile.p2p.P2PMessage
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.encodeToJsonElement
import java.util.concurrent.ConcurrentHashMap

/**
 * GitHub API proxy client
 * All GitHub requests are proxied through the desktop app
 */
class GitHubProxyClient(
    private val connectionManager: DesktopConnectionManager
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    // Pending request tracking
    private val pendingRequests = ConcurrentHashMap<String, CompletableDeferred<GitHubResponse>>()
    
    // PR updates flow
    private val _prUpdates = MutableSharedFlow<PullRequest>(extraBufferCapacity = 10)
    val prUpdates: SharedFlow<PullRequest> = _prUpdates.asSharedFlow()
    
    init {
        // Listen for GitHub responses from desktop
        connectionManager.addMessageListener { message ->
            when (message) {
                is P2PMessage.GitHubResponse -> handleGitHubResponse(message)
                else -> { /* Ignore other messages */ }
            }
        }
    }
    
    /**
     * Get pull requests for a repository
     */
    suspend fun getPullRequests(
        owner: String,
        repo: String,
        state: PRState = PRState.OPEN
    ): Result<List<PullRequest>> {
        val endpoint = "/repos/$owner/$repo/pulls?state=${state.name.lowercase()}"
        return makeRequest(endpoint)
            .map { response ->
                json.decodeFromJsonElement(ListSerializer(PullRequest.serializer()), response.body)
            }
    }
    
    /**
     * Get a specific pull request
     */
    suspend fun getPullRequest(
        owner: String,
        repo: String,
        prNumber: Int
    ): Result<PullRequest> {
        val endpoint = "/repos/$owner/$repo/pulls/$prNumber"
        return makeRequest(endpoint)
            .map { response ->
                json.decodeFromJsonElement(PullRequest.serializer(), response.body)
            }
    }
    
    /**
     * Merge a pull request
     */
    suspend fun mergePullRequest(
        owner: String,
        repo: String,
        prNumber: Int,
        method: MergeMethod = MergeMethod.MERGE,
        commitTitle: String? = null,
        commitMessage: String? = null
    ): Result<MergeResult> {
        val endpoint = "/repos/$owner/$repo/pulls/$prNumber/merge"
        
        val body = buildMap {
            put("merge_method", method.name.lowercase())
            commitTitle?.let { put("commit_title", it) }
            commitMessage?.let { put("commit_message", it) }
        }
        
        return makeRequest(endpoint, method = "PUT", body = body)
            .map { response ->
                json.decodeFromJsonElement(MergeResult.serializer(), response.body)
            }
    }
    
    /**
     * Check if PR has merge conflicts
     */
    suspend fun checkMergeability(
        owner: String,
        repo: String,
        prNumber: Int
    ): Result<MergeabilityStatus> {
        return getPullRequest(owner, repo, prNumber)
            .map { pr ->
                MergeabilityStatus(
                    isMergeable = pr.mergeable == true,
                    hasConflicts = pr.mergeable == false,
                    checksStatus = pr.checksStatus
                )
            }
    }
    
    /**
     * Get repository list
     */
    suspend fun getRepositories(): Result<List<Repository>> {
        return makeRequest("/user/repos?sort=updated&per_page=100")
            .map { response ->
                json.decodeFromJsonElement(ListSerializer(Repository.serializer()), response.body)
            }
    }
    
    /**
     * Get check runs for a PR
     */
    suspend fun getCheckRuns(
        owner: String,
        repo: String,
        ref: String
    ): Result<CheckRunsResponse> {
        return makeRequest("/repos/$owner/$repo/commits/$ref/check-runs")
            .map { response ->
                json.decodeFromJsonElement(CheckRunsResponse.serializer(), response.body)
            }
    }
    
    /**
     * Start monitoring PR for updates
     */
    fun startMonitoring(owner: String, repo: String, prNumber: Int) {
        scope.launch {
            while (isActive) {
                val result = getPullRequest(owner, repo, prNumber)
                result.onSuccess { pr ->
                    _prUpdates.tryEmit(pr)
                }
                delay(30000) // Check every 30 seconds
            }
        }
    }
    
    /**
     * Make a request through the desktop proxy
     */
    private suspend fun makeRequest(
        endpoint: String,
        method: String = "GET",
        body: Map<String, String>? = null
    ): Result<GitHubResponse> {
        if (connectionManager.connectionState.value !is ConnectionState.Connected) {
            return Result.failure(Exception("Not connected to desktop"))
        }
        
        val requestId = generateRequestId()
        val deferred = CompletableDeferred<GitHubResponse>()
        pendingRequests[requestId] = deferred
        
        val message = P2PMessage.GitHubRequest(
            requestId = requestId,
            endpoint = endpoint,
            method = method,
            body = body?.let { json.encodeToJsonElement(it) }
        )
        
        val sent = connectionManager.sendMessage(message)
        if (!sent) {
            pendingRequests.remove(requestId)
            return Result.failure(Exception("Failed to send request"))
        }
        
        return try {
            withTimeout(30000) {
                val response = deferred.await()
                if (response.statusCode in 200..299) {
                    Result.success(response)
                } else {
                    Result.failure(
                        GitHubApiException(
                            statusCode = response.statusCode,
                            message = response.error ?: "GitHub API error"
                        )
                    )
                }
            }
        } catch (e: TimeoutCancellationException) {
            pendingRequests.remove(requestId)
            Result.failure(Exception("Request timeout"))
        } catch (e: Exception) {
            pendingRequests.remove(requestId)
            Result.failure(e)
        }
    }
    
    private fun handleGitHubResponse(response: P2PMessage.GitHubResponse) {
        val deferred = pendingRequests.remove(response.requestId)
        if (deferred != null) {
            deferred.complete(
                GitHubResponse(
                    statusCode = response.statusCode,
                    body = response.body ?: Json.parseToJsonElement("{}"),
                    error = response.error
                )
            )
        }
    }
    
    private fun generateRequestId(): String {
        return "gh_${System.currentTimeMillis()}_${(0..9999).random()}"
    }
}

@Serializable
data class PullRequest(
    val number: Int,
    val title: String,
    val state: String,
    val user: GitHubUser,
    val body: String? = null,
    val head: BranchRef,
    val base: BranchRef,
    val mergeable: Boolean? = null,
    val merged: Boolean = false,
    val merge_commit_sha: String? = null,
    val checksStatus: ChecksStatus = ChecksStatus.PENDING
)

@Serializable
data class GitHubUser(
    val login: String,
    val avatar_url: String? = null
)

@Serializable
data class BranchRef(
    val ref: String,
    val sha: String,
    val repo: Repository? = null
)

@Serializable
data class Repository(
    val id: Long,
    val name: String,
    val full_name: String,
    val owner: GitHubUser,
    val private: Boolean,
    val html_url: String
)

@Serializable
data class MergeResult(
    val sha: String,
    val merged: Boolean,
    val message: String
)

@Serializable
data class CheckRunsResponse(
    val total_count: Int,
    val check_runs: List<CheckRun>
)

@Serializable
data class CheckRun(
    val id: Long,
    val name: String,
    val status: String,
    val conclusion: String? = null,
    val html_url: String? = null
)

data class GitHubResponse(
    val statusCode: Int,
    val body: JsonElement,
    val error: String? = null
)

data class MergeabilityStatus(
    val isMergeable: Boolean,
    val hasConflicts: Boolean,
    val checksStatus: ChecksStatus
)

enum class PRState { OPEN, CLOSED, ALL }
enum class MergeMethod { MERGE, SQUASH, REBASE }
enum class ChecksStatus { PENDING, PASSING, FAILING }

class GitHubApiException(
    val statusCode: Int,
    override val message: String
) : Exception(message)