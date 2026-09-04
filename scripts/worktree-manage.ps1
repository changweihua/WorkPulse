# Git Worktree management for AI Agent parallel development
# Usage:
#   .\scripts\worktree-manage.ps1 create <agent-id> <feature-name>  - Create isolated worktree
#   .\scripts\worktree-manage.ps1 merge <agent-id>                  - Merge back to main
#   .\scripts\worktree-manage.ps1 list                              - List all worktrees
#   .\scripts\worktree-manage.ps1 cleanup <agent-id>                - Remove worktree + branch
#   .\scripts\worktree-manage.ps1 prune                             - Clean stale records

param(
    [Parameter(Position=0)]
    [ValidateSet("create","merge","list","cleanup","prune")]
    [string]$Action,

    [Parameter(Position=1)]
    [string]$AgentId,

    [Parameter(Position=2)]
    [string]$FeatureName
)

$ErrorActionPreference = "Stop"
$RepoRoot = "D:\Github\WorkPulse"

switch ($Action) {
    "create" {
        if (-not $AgentId -or -not $FeatureName) {
            Write-Host "Usage: .\worktree-manage.ps1 create <agent-id> <feature-name>"
            Write-Host "Example: .\worktree-manage.ps1 create agent-a feat-idle-chart"
            exit 1
        }

        $WorktreePath = Join-Path (Split-Path $RepoRoot -Parent) "WorkPulse-$AgentId"
        $BranchName = "agent/$AgentId/$FeatureName"

        if (Test-Path $WorktreePath) {
            Write-Host "[ERROR] Worktree path already exists: $WorktreePath"
            exit 1
        }

        $existingWorktree = git worktree list | Select-String $BranchName
        if ($existingWorktree) {
            Write-Host "[ERROR] Branch $BranchName is already checked out"
            exit 1
        }

        Write-Host "[CREATE] Creating isolated worktree..."
        Write-Host "  Agent ID:    $AgentId"
        Write-Host "  Branch:      $BranchName"
        Write-Host "  Worktree:    $WorktreePath"

        git worktree add $WorktreePath -b $BranchName

        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Worktree created successfully"
            Write-Host "  Agent can work freely in $WorktreePath"
        } else {
            Write-Host "[ERROR] Failed to create worktree"
            exit 1
        }
    }

    "merge" {
        if (-not $AgentId) {
            Write-Host "Usage: .\worktree-manage.ps1 merge <agent-id>"
            exit 1
        }

        $BranchName = "agent/$AgentId/*"
        $branches = git branch --list $BranchName

        if (-not $branches) {
            Write-Host "[ERROR] No branch found for agent $AgentId"
            exit 1
        }

        $branch = ($branches | Select-Object -First 1).Trim().TrimStart("* ")
        Write-Host "[MERGE] Merging branch: $branch"

        Set-Location $RepoRoot
        git merge $branch

        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] Merge successful"
        } else {
            Write-Host "[WARN] Merge conflicts detected, resolve manually"
            exit 1
        }
    }

    "list" {
        Write-Host "[LIST] Current worktrees:"
        Write-Host ""
        git worktree list
        Write-Host ""
        $count = (git worktree list | Measure-Object -Line).Lines
        Write-Host "Total: $count worktrees"
    }

    "cleanup" {
        if (-not $AgentId) {
            Write-Host "Usage: .\worktree-manage.ps1 cleanup <agent-id>"
            exit 1
        }

        $WorktreePath = Join-Path (Split-Path $RepoRoot -Parent) "WorkPulse-$AgentId"
        $BranchPattern = "agent/$AgentId/*"

        $branches = git branch --list $BranchPattern
        if ($branches) {
            $branch = ($branches | Select-Object -First 1).Trim().TrimStart("* ")

            if (Test-Path $WorktreePath) {
                $status = git -C $WorktreePath status --porcelain
                if ($status) {
                    Write-Host "[WARN] Worktree has uncommitted changes:"
                    Write-Host $status
                    Write-Host ""
                    $confirm = Read-Host "Force remove? (y/N)"
                    if ($confirm -ne "y") {
                        Write-Host "[CANCELLED]"
                        exit 0
                    }
                }

                Write-Host "[CLEANUP] Removing worktree: $WorktreePath"
                git worktree remove $WorktreePath --force
            }

            Write-Host "[CLEANUP] Removing branch: $branch"
            git branch -D $branch
            Write-Host "[OK] Cleanup complete"
        } else {
            if (Test-Path $WorktreePath) {
                git worktree remove $WorktreePath --force
                Write-Host "[OK] Removed stale worktree path"
            } else {
                Write-Host "[INFO] Agent $AgentId has no worktree or branch to clean"
            }
        }
    }

    "prune" {
        Write-Host "[PRUNE] Cleaning stale worktree records..."
        git worktree prune
        Write-Host "[OK] Prune complete"
        git worktree list
    }

    default {
        Write-Host "Git Worktree Manager"
        Write-Host ""
        Write-Host "Usage:"
        Write-Host "  .\worktree-manage.ps1 create <agent-id> <feature>   Create isolated worktree"
        Write-Host "  .\worktree-manage.ps1 merge <agent-id>              Merge back to main"
        Write-Host "  .\worktree-manage.ps1 list                          List all worktrees"
        Write-Host "  .\worktree-manage.ps1 cleanup <agent-id>            Remove worktree + branch"
        Write-Host "  .\worktree-manage.ps1 prune                         Clean stale records"
    }
}
