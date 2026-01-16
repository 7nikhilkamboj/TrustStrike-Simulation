var campaignId = window.location.pathname.split('/').pop()
if (campaignId == "campaign") {
    campaignId = null
}

var cachedModalData = null;
var smtp_profiles = []
var sms_profiles = []
var groups = []

var profileCurrentPage = 1;
var profileItemsPerPage = 6;

// --- Profile Table Logic ---

// Helper to fetch filtered profiles
function getFilteredProfiles() {
    var type = $("#campaign_type").val();
    // Map campaign type to profile interface type
    // SMS -> SMS, Email -> SMTP, QR -> SMTP (Email)
    if (type == 'sms') return sms_profiles;
    return smtp_profiles;
}

// Render the profiles table
window.renderProfileTable = function () {
    var profiles = getFilteredProfiles();
    var tbody = $("#profileTableBody");
    tbody.empty();

    var filter = $("#profileSearch").val().toLowerCase();

    // Safety check if profiles is undefined (e.g. init)
    if (!profiles) {
        tbody.append('<tr><td colspan="6" class="text-center">No profiles found.</td></tr>');
        return;
    }

    var visibleProfiles = profiles.filter(function (p) {
        if (!filter) return true;
        return (p.name && p.name.toLowerCase().indexOf(filter) > -1);
    });

    if (visibleProfiles.length === 0) {
        tbody.append('<tr><td colspan="6" class="text-center">No profiles found matching criteria.</td></tr>');
        $("#profilePagination").hide();
        return;
    }

    var totalPages = Math.ceil(visibleProfiles.length / profileItemsPerPage);
    if (profileCurrentPage > totalPages) profileCurrentPage = 1;
    if (profileCurrentPage < 1) profileCurrentPage = 1;

    var start = (profileCurrentPage - 1) * profileItemsPerPage;
    var end = start + profileItemsPerPage;
    var pageItems = visibleProfiles.slice(start, end);

    // Get currently selected profile ID
    var selectedId = $("#profile").val();

    pageItems.forEach(function (p) {
        var tr = $("<tr>");
        tr.attr("id", "profile-row-" + p.id);
        tr.css("cursor", "pointer");

        var isSelected = (selectedId == p.id);
        if (isSelected) tr.addClass("success");

        tr.click(function (e) {
            if ($(e.target).closest('button').length) return;
            toggleProfileSelection(p.id, p.name, tr);
        });

        // Checkbox/Radio column
        var checkIcon = isSelected ? "fa-check-circle-o" : "fa-circle-o";
        tr.append($("<td class='text-center'>").html(`<i class="fa ${checkIcon} profile-check"></i>`));

        tr.append($("<td>").text(p.name));

        // Interface Type Badge
        var iType = (p.interface_type || (p.host ? 'SMTP' : 'SMS')).toUpperCase(); // Heuristic if type missing
        var labelClass = (iType === 'SMS') ? 'label-info' : 'label-success';
        tr.append($("<td class='text-center'>").html(`<span class="label ${labelClass}" style="font-size: 11px;">${iType}</span>`));

        tr.append($("<td>").text("admin")); // Created By (placeholder)

        var dateStr = p.modified_date ? moment(p.modified_date).format('MMMM Do YYYY, h:mm:ss a') : "-";
        tr.append($("<td>").text(dateStr));

        // Actions
        var actionTd = $("<td class='text-right'>");

        // Edit
        var editBtn = $(`<button class="btn btn-success btn-xs" style="margin-right: 5px; color: #FFF !important;"><i class="fa fa-pencil"></i></button>`);
        editBtn.click(function (e) { e.stopPropagation(); editProfile(p.id, iType); });

        // Copy
        var copyBtn = $(`<button class="btn btn-success btn-xs" style="margin-right: 5px; color: #FFF !important;" title="Copy Profile"><i class="fa fa-copy"></i></button>`);
        copyBtn.click(function (e) {
            e.stopPropagation();
            window.copyProfile(p.id, iType);
        });

        // Delete
        var delBtn = $(`<button class="btn btn-danger btn-xs"><i class="fa fa-trash"></i></button>`);
        delBtn.click(function (e) { e.stopPropagation(); deleteProfile(p.id, iType, p.name); });

        actionTd.append(editBtn).append(copyBtn).append(delBtn);
        tr.append(actionTd);

        tbody.append(tr);
    });

    renderPaginationControls("profilePagination", profileCurrentPage, totalPages, "changeProfilePage");
};

window.changeProfilePage = function (page) {
    profileCurrentPage = page;
    window.renderProfileTable();
};

function toggleProfileSelection(id, name, tr) {
    var input = $("#profile");
    var inputName = $("#profile_name");

    var currentId = input.val();
    if (currentId == id) {
        return;
    }

    // Deselect all others
    $("#profileTableBody tr").removeClass("success");
    $("#profileTableBody .profile-check").removeClass("fa-check-circle-o").addClass("fa-circle-o");

    // Select this
    input.val(id);
    inputName.val(name);

    tr.addClass("success");
    tr.find(".profile-check").removeClass("fa-circle-o").addClass("fa-check-circle-o");
}

window.updateProfileSelect = function () {
    window.renderProfileTable();
};

$("#profileSearch").on("keyup", function () {
    profileCurrentPage = 1;
    window.renderProfileTable();
});

function renderOptions(data) {
    var currentType = $("#campaign_type").val();

    // 1. Filter Groups
    var filteredGroups = $.grep(data.groups, function (obj) {
        if (currentType == "sms") {
            return obj.group_type == "sms";
        }
        // Email/QR bucket: Include 'email', 'qr', or generic groups
        return obj.group_type == "email" || obj.group_type == "qr" || !obj.group_type;
    });

    var group_s2 = $.map(filteredGroups, function (obj) {
        // obj.id is the integer ID, kept intact for other uses (like delete)
        obj.text = obj.name
        obj.title = obj.num_targets + " targets"
        return obj
    });
    var users_select = $("#users")
    var currentSelection = users_select.val();

    users_select.empty();
    // Populate options
    $.each(group_s2, function (i, g) {
        // Use Name as VALUE so toggleGroupSelection works (it uses Name)
        // Use Name as TEXT for display
        users_select.append(new Option(g.text, g.text));
    });

    if (currentSelection) {
        users_select.val(currentSelection);
    }

    // 2. Filter Templates
    var filteredTemplates = $.grep(data.templates, function (t) {
        var tType = t.type;
        // Legacy/Heuristic check
        if (!tType) {
            if ((!t.html || t.html.length === 0) && t.text && t.text.length > 0) {
                tType = "sms";
            } else {
                tType = "email";
            }
        }
        if (currentType == "sms") {
            return tType == "sms";
        } else if (currentType == "email") {
            return tType == "email";
        } else if (currentType == "qr") {
            return tType == "qr";
        }
    });

    // Destroy existing table if exists (cleanup legacy)
    if ($.fn.DataTable.isDataTable('#templateTable')) {
        $('#templateTable').DataTable().destroy();
    }

    currentTypeTemplates = filteredTemplates; // Update global for search
    renderTemplateGrid(filteredTemplates);

    // 3. Update Globals & Profiles
    updateProfileSelect();
}

// Global scope needed for onclick handlers in grid


window.previewTemplateFull = function (id) {
    if (window.event) window.event.stopPropagation();
    var tmpl = getTemplateById(id);
    if (!tmpl) return;

    var content = "";
    if (tmpl.type == "sms" || ((!tmpl.html || tmpl.html.length === 0) && tmpl.text)) {
        content = "<pre style='text-align: left; white-space: pre-wrap;'>" + escapeHtml(tmpl.text || "") + "</pre>";
    } else {
        content = tmpl.html || "";
    }

    // Encode content as base64 for safe transport (XSS protection)
    var base64Content = btoa(unescape(encodeURIComponent(content)));

    // Use data URL with sandboxed iframe to prevent XSS
    // sandbox="" blocks all scripts, forms, etc. We use allow-same-origin to render styles
    var iframeSrc = 'data:text/html;base64,' + base64Content;

    Swal.fire({
        title: 'Preview: ' + escapeHtml(tmpl.name),
        html: '<div style="height: 500px; overflow: auto; border: 1px solid #ddd; background: #fff;">' +
            '<iframe src="' + iframeSrc + '" sandbox="allow-same-origin" style="width: 100%; height: 100%; border: none;"></iframe>' +
            '</div>',
        width: 800,
        showCloseButton: true,
        showConfirmButton: false
    });
};

window.editTemplate = function (id) {
    var tmpl = getTemplateById(id);
    if (!tmpl) return;

    $("#createTemplateModalLabel").text("Edit Template");
    window.currentEditingTemplateId = id; // Set ID for Update

    // Check type to switch tab if needed
    var type = tmpl.type || "email";
    // Usually type matches filtered list, but ensure UI is synced? 
    // The modal open handler syncs to campaign type, which should match template filter.
    // However, explicitly updating fields is safer.

    $("#modal_template_name").val(tmpl.name);
    $("#modal_template_type").val(type).trigger('change');

    if (type == "sms") {
        $("#modal_sms_editor").val(tmpl.text || "");
    } else {
        $("#modal_subject").val(tmpl.subject || "");
        $("#modal_envelope_sender").val(tmpl.envelope_sender || "");

        var htmlContent = tmpl.html || "";
        $("#modal_html_editor").val(htmlContent);
        if (CKEDITOR.instances["modal_html_editor"]) {
            CKEDITOR.instances["modal_html_editor"].setData(htmlContent);
        }
        $("#modal_text_editor").val(tmpl.text || "");
    }

    $("#createTemplateModal").modal("show");

    if (window.event) window.event.stopPropagation();
};

window.copyTemplate = function (id) {
    var tmpl = getTemplateById(id);
    if (!tmpl) return;

    $("#createTemplateModalLabel").text("New Template (Copy)");
    $("#modal_template_name").val(tmpl.name + " (Copy)");
    updateTemplateModalUI(tmpl.type || "email");

    if (tmpl.type == "sms") {
        $("#modal_sms_editor").val(tmpl.text || "");
    } else {
        $("#modal_subject").val(tmpl.subject || "");
        $("#modal_envelope_sender").val(tmpl.envelope_sender || "");

        var htmlContent = tmpl.html || "";
        $("#modal_html_editor").val(htmlContent);
        if (CKEDITOR.instances["modal_html_editor"]) {
            CKEDITOR.instances["modal_html_editor"].setData(htmlContent);
        } else {
            $("#modal_html_editor").ckeditor();
        }

        $("#modal_text_editor").val(tmpl.text || "");
    }

    // Clear ID (it's a new one)
    window.currentEditingTemplateId = null;
    $("#createTemplateModal").modal("show");

    if (window.event) window.event.stopPropagation();
};

window.deleteTemplate = function (id) {
    if (window.event) window.event.stopPropagation();

    var tmpl = getTemplateById(id);
    if (!tmpl) return;

    Swal.fire({
        title: "Are you sure?",
        text: "Delete template '" + tmpl.name + "'?",
        type: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d9534f",
        confirmButtonText: "Delete",
        reverseButtons: true
    }).then(function (result) {
        if (result.value) {
            api.templateId.delete(id)
                .done(function () {
                    // Refresh
                    setupOptions(true).then(function () {
                        successFlash("Template deleted.");
                    });
                })
                .fail(function () {
                    errorFlash("Failed to delete template.");
                });
        }
    });
};

window.selectTemplateCard = function (id) {
    var tmpl = getTemplateById(id);
    if (!tmpl) return;

    $(".template-card").removeClass("selected");
    $("#card-" + id).addClass("selected");

    $("#template").val(id);
    $("#template_name").val(tmpl.name);
};

window.openCreateTemplateModal = function () {
    $("#createTemplateModalLabel").text("New Template");
    window.currentEditingTemplateId = null; // Clear ID -> Create Mode
    $("#modal_template_name").val("");
    $("#modal_subject").val("");
    $("#modal_envelope_sender").val("");
    if (CKEDITOR.instances["modal_html_editor"]) {
        CKEDITOR.instances["modal_html_editor"].setData("");
    }
    $("#modal_text_editor").val("");
    $("#modal_sms_editor").val("");

    var campaignType = $("#campaign_type").val();
    updateTemplateModalUI(campaignType); // Default new template to campaign type

    $("#createTemplateModal").modal("show");
};

function getTemplateById(id) {
    if (!cachedModalData || !cachedModalData.templates) return null;
    return cachedModalData.templates.find(function (t) { return t.id == id; });
}

// Pagination State
var gridCurrentPage = 1;
var gridItemsPerPage = 6; // 6 items per page as requested
var currentGridTemplates = []; // Templates currently being shown (after filtering)
var currentTypeTemplates = []; // All templates of the current type (before search)

// Search Listener - Ensure we don't bind multiple times
$(document).off('keyup', '#templateSearch').on('keyup', '#templateSearch', function () {
    var query = $(this).val().toLowerCase();
    filterAndRenderGrid(query);
});

function filterAndRenderGrid(query) {
    if (!query) {
        currentGridTemplates = currentTypeTemplates;
    } else {
        currentGridTemplates = currentTypeTemplates.filter(function (t) {
            var matchName = t.name.toLowerCase().indexOf(query) > -1;
            var matchType = (t.type || "").toLowerCase().indexOf(query) > -1;
            return matchName || matchType;
        });
    }
    // Reset to page 1 on filtering
    gridCurrentPage = 1;
    renderTemplateGrid(currentGridTemplates);
}

function renderTemplateGrid(templates) {
    // Note: 'templates' argument here is actually used as the source for pagination. 
    // Usually we pass currentGridTemplates to it, or we rely on the global.
    // To match previous logic, let's keep using the argument but be aware.

    // Update the global if passing something new (usually valid)
    currentGridTemplates = templates;

    var totalPages = Math.ceil(templates.length / gridItemsPerPage);

    // Safety check
    if (gridCurrentPage > totalPages) gridCurrentPage = 1;
    if (gridCurrentPage < 1) gridCurrentPage = 1;

    var start = (gridCurrentPage - 1) * gridItemsPerPage;
    var end = start + gridItemsPerPage;
    var pageItems = templates.slice(start, end);

    var container = $("#templateGrid");
    container.empty();

    if (templates.length === 0) {
        $("#noTemplatesMessage").show();
        $("#gridPagination").hide();
        return;
    } else {
        $("#noTemplatesMessage").hide();
    }

    pageItems.forEach(function (t) {
        var previewHtml = "";

        if (t.type == "sms" || ((!t.html || t.html.length === 0) && t.text)) {
            // Text Preview
            previewHtml = '<div class="text-preview">' + escapeHtml(t.text || "") + '</div>';
        } else {
            // HTML Preview (Iframe)
            var cleanHtml = (t.html || "").replace(/"/g, '&quot;');
            previewHtml = '<iframe srcdoc="' + cleanHtml + '" sandbox></iframe>';
        }

        var typeStr = t.type ? t.type.toUpperCase() : "EMAIL";
        var btnClass = "btn-success"; // Default Email (Green)
        if (typeStr === "SMS") btnClass = "btn-info"; // Cyan
        if (typeStr === "QR") btnClass = "btn-primary"; // Blue

        var card = `
        <div class="col-md-4 col-sm-6">
            <div class="template-card" id="card-${t.id}" onclick="selectTemplateCard(${t.id})">
                 <div class="template-header">
                    <div class="template-name" title="${escapeHtml(t.name)}">${escapeHtml(t.name)}</div>
                     <div class="template-type">
                        <button class="btn ${btnClass} btn-xs" onclick="previewTemplateFull(${t.id}); event.stopPropagation();" title="Full Preview" style="padding: 4px 8px; font-size: 14px; font-weight: bold; border-width: 2px;">
                            FULL PREVIEW
                        </button>
                     </div>
                </div>
                <div class="template-preview">
                    ${previewHtml}
                </div>
                 <div class="template-footer">
                     <div class="template-actions">
                        <button class="btn btn-default btn-sm btn-action" onclick="editTemplate(${t.id})" title="Edit">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button class="btn btn-default btn-sm btn-action" onclick="copyTemplate(${t.id})" title="Copy">
                            <i class="fa fa-copy"></i>
                        </button>
                        <button class="btn btn-danger btn-sm btn-action-delete" onclick="deleteTemplate(${t.id})" title="Delete">
                             <i class="fa fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
        container.append(card);
    });

    renderPaginationControls(totalPages);

    // Reselect if value exists and is on this page
    var currentId = $("#template").val();
    if (currentId) {
        // We only highlight if it exists on the screen.
        // It might be on another page, but the hidden input retains the value.
        // If we want to jump to the page with selected item, we'd need extra logic.
        // For now, just highlight if present.
        var onPage = pageItems.find(function (t) { return t.id == currentId; });
        if (onPage) {
            $("#card-" + currentId).addClass("selected");
        }
    }
}

function renderPaginationControls(containerId, currentPage, totalPages, changePageFnName) {
    // Handle legacy 1-arg call for Step 2 Template Grid
    if (arguments.length === 1) {
        var tPages = containerId; // first arg is totalPages
        if (tPages <= 1) {
            $("#gridPagination").hide();
            return;
        }
        var html = '<ul class="pagination" style="margin: 0;">';
        var prevDisabled = (gridCurrentPage === 1) ? 'disabled' : '';
        html += '<li class="' + prevDisabled + '"><a href="#" onclick="changeGridPage(' + (gridCurrentPage - 1) + '); return false;">&laquo;</a></li>';
        for (var i = 1; i <= tPages; i++) {
            var active = (i === gridCurrentPage) ? 'active' : '';
            html += '<li class="' + active + '"><a href="#" onclick="changeGridPage(' + i + '); return false;">' + i + '</a></li>';
        }
        var nextDisabled = (gridCurrentPage === tPages) ? 'disabled' : '';
        html += '<li class="' + nextDisabled + '"><a href="#" onclick="changeGridPage(' + (gridCurrentPage + 1) + '); return false;">&raquo;</a></li>';
        html += '</ul>';
        $("#gridPagination").html(html).show();
        return;
    }

    if (totalPages <= 1) {
        $("#" + containerId).empty().hide();
        return;
    }

    var html = '<ul class="pagination" style="margin: 0;">';

    // Prev
    var prevDisabled = (currentPage === 1) ? 'disabled' : '';
    html += '<li class="' + prevDisabled + '"><a href="#" onclick="' + changePageFnName + '(' + (currentPage - 1) + '); return false;">&laquo;</a></li>';

    // Numbers
    for (var i = 1; i <= totalPages; i++) {
        var active = (i === currentPage) ? 'active' : '';
        html += '<li class="' + active + '"><a href="#" onclick="' + changePageFnName + '(' + i + '); return false;">' + i + '</a></li>';
    }

    // Next
    var nextDisabled = (currentPage === totalPages) ? 'disabled' : '';
    html += '<li class="' + nextDisabled + '"><a href="#" onclick="' + changePageFnName + '(' + (currentPage + 1) + '); return false;">&raquo;</a></li>';

    html += '</ul>';

    $("#" + containerId).html(html).show();
}

window.changeGridPage = function (page) {
    var totalPages = Math.ceil(currentGridTemplates.length / gridItemsPerPage);
    if (page < 1 || page > totalPages) return;
    gridCurrentPage = page;
    renderTemplateGrid(currentGridTemplates);
};

// --- Wizard Logic ---
var currentStep = 1;
var totalSteps = 9;

// Ensure global scope availability
window.currentStep = currentStep;

function showStep(step) {

    $(".wizard-step").removeClass("active");
    $("#step" + step).addClass("active");

    // Button visibility
    if (step == 1) {
        $("#prevBtn").hide();
    } else {
        $("#prevBtn").show();
    }

    if (step == totalSteps) {
        $("#nextBtn").hide();
        $("#launchButton").show();
    } else {
        $("#nextBtn").show();
        $("#launchButton").hide();
    }

    currentStep = step;

    // Hide the persistent flow preview on Step 9 (Blueprint takes over)
    if (step == 9) {
        $("#campaignFlowPreview").hide();
    } else {
        $("#campaignFlowPreview").show();
    }

    // Step 5: Refresh lures to show updated enabled phishlet domains
    if (step == 5) {
        refreshLuresForStep5();
    }

    // Step 9: Populate Visual Blueprint
    if (step == 9) {
        populateVisualBlueprint();
    }

    // Reset scroll position to top of page/container
    window.scrollTo(0, 0);
    if ($(".modal-body").length) {
        $(".modal-body").scrollTop(0);
    }

    // Update Flow Diagram Visuals
    updateVisualFlow(step);
}

function populateVisualBlueprint() {
    // 1. Primary Flow Pillars
    var templateName = $("#template_name").val() || "None selected";
    $("#vis_template_name_pb").text(templateName);

    var selectedGroups = $("#users").val() || [];
    var groupsText = selectedGroups.length > 0 ? selectedGroups.join(", ") : "None Selected";
    $("#vis_groups_pb").text(groupsText);

    var profileName = $("#profile_name").val() || "None selected";
    $("#vis_profile_pb").text(profileName);

    var launchTime = $("#launch_date").val() || "Immediate";
    var launchObjective = $("#attack_objective").val() || "Tracking only";
    $("#vis_launch_pb").text(launchTime + " (" + launchObjective + ")");

    // 2. Secondary Detail Cards
    // Audience
    $("#vis_groups_secondary").text(groupsText);
    $("#vis_profile_secondary").text(profileName);

    // Configuration
    $("#vis_objective_secondary").text(launchObjective);
    var campaignType = $("#campaign_type").val();
    var sourceText = campaignType === "sms" ? "SMS Gateway" : (campaignType === "qr" ? "QR Generation" : "Email Server");
    $("#vis_source_secondary").text(sourceText);

    // Timeline
    $("#vis_launch_secondary").text(launchTime);
    var stopTime = $("#scheduled_stop_date").val() || "Manual Stop";
    $("#vis_stop_secondary").text(stopTime);
}

// Update the visual flow diagram based on current step
function updateVisualFlow(step) {
    // Reset all
    $(".flow-box").removeClass("active completed disabled");

    // Individual steps 1-5 (Attack Flow)
    var attackFlowNodes = [
        { id: "flow_box_campaign", step: 1 },
        { id: "flow_box_template", step: 2 },
        { id: "flow_box_redirector", step: 3 },
        { id: "flow_box_login", step: 4 },
        { id: "flow_box_final", step: 5 }
    ];

    // Steps 6-8 (Campaign Config)
    var configNodes = [
        { id: "flow_box_groups", step: 6 },
        { id: "flow_box_profile", step: 7 },
        { id: "flow_box_schedule", step: 8 }
    ];

    // Check states
    var useRedirector = $("#useRedirector").is(":checked");
    var trackingOnly = $("#attack_objective").val() === "Tracking only";
    var campaignType = $("#campaign_type").val();

    // Update labels/icons for Campaign and Template nodes based on type
    var $campaignBox = $("#flow_box_campaign");
    var $templateBox = $("#flow_box_template");

    if (campaignType === "sms") {
        $campaignBox.find(".flow-value").text("SMS");
        $templateBox.find(".flow-label").text("Template");
        $templateBox.find(".flow-value").text("SMS");
        $templateBox.find("i").attr("class", "fa fa-commenting");
    } else if (campaignType === "qr") {
        $campaignBox.find(".flow-value").text("QR");
        $templateBox.find(".flow-label").text("Setup");
        $templateBox.find(".flow-value").text("QR");
        $templateBox.find("i").attr("class", "fa fa-qrcode");
    } else {
        // Default Email
        $campaignBox.find(".flow-value").text("EMAIL");
        $templateBox.find(".flow-label").text("Template");
        $templateBox.find(".flow-value").text("Email");
        $templateBox.find("i").attr("class", "fa fa-envelope");
    }

    // Determine if we show collapsed view (step >= 6)
    var showCollapsed = (step >= 6);

    // Update collapsed box label based on campaign type
    var flowLabel = "Email Flow";
    if (campaignType === "sms") {
        flowLabel = "SMS Flow";
    } else if (campaignType === "qr") {
        flowLabel = "QR Flow";
    }
    $("#collapsed_flow_label").text(flowLabel);

    if (showCollapsed) {
        // COLLAPSED VIEW: Hide individual steps 1-5, show collapsed box
        attackFlowNodes.forEach(function (node) {
            $("#" + node.id).hide();
        });
        // Hide all arrows for steps 1-5 by ID
        $("#flow_arrow_1, #flow_arrow_2, #flow_arrow_3, #flow_arrow_4").hide();

        // Show collapsed box and its arrow
        $("#flow_box_collapsed").show().addClass("completed");
        $("#flow_arrow_collapsed").show();

        // Show config nodes (6-8)
        configNodes.forEach(function (node) {
            var $el = $("#" + node.id);
            $el.show();

            if (node.step < step) {
                $el.addClass("completed");
            } else if (node.step === step) {
                $el.addClass("active");
            }
        });
        // Show arrows for config nodes
        $("#flow_arrow_6").show();
        $("#flow_arrow_7").show();

    } else {
        // EXPANDED VIEW: Show individual steps 1-5, hide collapsed box
        $("#flow_box_collapsed").hide();
        $("#flow_arrow_collapsed").hide();

        // Hide config nodes (they're not relevant yet)
        configNodes.forEach(function (node) {
            $("#" + node.id).hide();
        });
        $(".flow-row-break").hide();
        $("#flow_arrow_6").hide();
        $("#flow_arrow_7").hide();

        // Show and manage attack flow nodes
        attackFlowNodes.forEach(function (node) {
            var $el = $("#" + node.id);
            $el.show();

            // Redirector disabled logic
            if (node.id === "flow_box_redirector" && !useRedirector) {
                $el.addClass("disabled");
                return;
            }

            // Tracking Only: hide Login node
            if (node.id === "flow_box_login" && trackingOnly) {
                $el.hide();
                $("#flow_arrow_4").hide();
                return;
            }

            if (node.step < step) {
                $el.addClass("completed");
            } else if (node.step === step) {
                $el.addClass("active");
            }
        });

        // Show arrows for visible attack flow steps by ID
        $("#flow_arrow_1, #flow_arrow_2, #flow_arrow_3, #flow_arrow_4").show();
        if (trackingOnly) {
            $("#flow_arrow_4").hide();
        }
    }
}

// Add event listeners for dynamic updates
// Consolidated event listeners removed from here and moved to main ready block at the end of file

// Refresh lures in Step 5 to show current enabled phishlet data
function refreshLuresForStep5() {
    // Reload modules to check enabled phishlets and update lure table
    loadModules();
    // Refresh lures table
    if (typeof refreshLures === 'function') {
        refreshLures();
    }
}

window.nextStep = function () {

    // Clear any previous validation errors
    $("#flashes").empty();

    if (currentStep < totalSteps) {
        if (!validateStep(currentStep)) return;

        var nextStepNum = currentStep + 1;

        // Skip Step 4 (Phishlet Selection) when in Tracking only mode
        if (window.skipPhishletStep && currentStep === 3) {
            nextStepNum = 5; // Skip from Step 3 to Step 5
            // Note: Lure creation moved to Step 5 when domain is selected
        }

        // When navigating from Step 3, create DNS A record for redirector domain if no subdomain was set
        if (currentStep === 3) {
            var useSubdomain = $("#useSubdomain").is(":checked");
            var redirectorDomain = $("#redirectorDomain").val();
            // Only create for main domain if no subdomain was set (subdomain DNS is created on "Set" click)
            if (!useSubdomain && redirectorDomain) {
                createRedirectorDNSRecord(redirectorDomain, redirectorDomain);
            }
        }

        // Auto-save Final Destination when leaving Step 5
        if (currentStep === 5) {
            var finalDest = $("#lureFinalDestination").val();
            if (finalDest && finalDest.trim() !== "") {
                saveFinalDestination();
            }
        }

        showStep(nextStepNum);
    }
};

window.prevStep = function () {

    // Clear validation errors when going back too? Maybe not necessary but cleaner.
    $("#flashes").empty();

    if (currentStep > 1) {
        var prevStepNum = currentStep - 1;

        // Skip Step 4 (Phishlet Selection) when in Tracking only mode
        if (window.skipPhishletStep && currentStep === 5) {
            prevStepNum = 3; // Skip from Step 5 back to Step 3
        }

        showStep(prevStepNum);
    }
};

function validateStep(step) {
    // Basic validation per step
    if (step == 1) {
        if ($("#name").val().trim() == "") {
            errorFlash("Please enter a campaign name.");
            return false;
        }
    }
    if (step == 2) {
        if ($("#template").val() == "") {
            errorFlash("Please select a template.");
            return false;
        }
    }
    // Step 3: Redirector Domain & Template
    if (step == 3) {
        if ($("#useRedirector").is(":checked")) {
            if ($("#redirectorDomain").val() == "") {
                errorFlash("Please select a Redirector Domain.");
                return false;
            }
            if ($("#redirectorTemplate").val() == "") {
                errorFlash("Please select a Redirector Template.");
                return false;
            }
        }
    }
    // Step 4: Phishlet Selection & Hostname (skipped in Tracking only mode)
    if (step == 4) {
        // Skip validation if in Tracking only mode (Step 4 is skipped)
        if (window.skipPhishletStep) {
            return true;
        }
        if ($("#phishletSelect").val() == "") {
            errorFlash("Please select a Phishlet.");
            return false;
        }
        if ($("#phishletHostname").val() == "") {
            errorFlash("Please select a Phishlet Hostname.");
            return false;
        }
    }
    if (step == 5) {
        // Skip lure validation in Tracking only mode (no phishlet/lure needed)
        if (!window.skipPhishletStep) {
            if ($("#selectedLureId").val() == "") {
                errorFlash("No lure found. Please select a phishlet in Step 4.");
                return false;
            }
        }
        if ($("#lureFinalDestination").val() == "") {
            errorFlash("Enter the final destination URL");
            return false;
        }
    }
    if (step == 6) {
        var groups = $("#users").val();
        if (!groups || groups.length === 0) {
            errorFlash("Please select at least one group.");
            return false;
        }
    }
    if (step == 7) {
        if ($("#profile").val() == "") {
            errorFlash("Please select a Sending Profile.");
            return false;
        }
    }
    // Step 8: Schedule - optional
    // Step 9: Launch - no validation
    return true;
}

// Log to confirm script update


async function setupOptions(forceRefresh) {
    if (cachedModalData && !forceRefresh) {
        renderOptions(cachedModalData);
        return Promise.resolve();
    }
    // cachedModalData = null; // Optional, or just overwrite in done
    var datas = await getStrikes();
    return $.when(
        api.groups.summary(),
        api.templates.get(),
        api.SMTP.get(),
        api.SMS.get(),

    ).done(function (g, t, smtp, sms) {

        cachedModalData = {
            groups: g[0].groups,
            templates: t[0],
            smtp: smtp[0],
            sms: sms[0],
            strikes: datas.success ? datas.data : []
        };
        groups = cachedModalData.groups;
        smtp_profiles = cachedModalData.smtp;
        sms_profiles = cachedModalData.sms;

        renderOptions(cachedModalData);
        window.renderGroupTable(cachedModalData.groups);
        renderLureTable(cachedModalData.strikes);

        if (pendingCampaignData) {
            populateCampaignData(pendingCampaignData);
            pendingCampaignData = null; // Clear it
        }

    }).fail(function () {
        errorFlash("Failed to load options!");
    });
}

async function getStrikes() {
    return $.get('/api/simulationserver/get_strikes')
        .then(
            function (data) {
                // success path
                if (data && data.success) {
                    return data;
                }
                // API responded but failed
                return [];
            },
            function () {
                // network/server failure
                return [];
            }
        );
}

function generateQR(url) {
    $("#qrcode").empty();
    var size = parseInt($("#qr_size").val()) || 160;
    if (url) {
        new QRCode(document.getElementById("qrcode"), {
            text: url,
            width: size,
            height: size,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }
}

// --- Redirector Domain Toggle ---
window.toggleRedirectorOptions = function () {
    var isChecked = $("#useRedirector").is(":checked");
    var statusSpan = $("#redirectorStatus");
    var flowCaptionText = $("#flowCaptionText");

    if (isChecked) {
        $("#redirectorOptions").css({ "opacity": "1", "pointer-events": "auto" });
        $("#redirectorTemplatePanel").css({ "opacity": "1", "pointer-events": "auto" });
        statusSpan.text("Enabled").css("color", "#5cb85c");

        // Show redirector in flow diagram
        $(".flow-bypass-arrow").addClass("hidden").hide();
        $(".flow-redirector-item").addClass("visible").show();

        var campaignType = $("#campaign_type").val() || "Email";
        flowCaptionText.html('<span style="color: #5cb85c;"><i class="fa fa-check-circle"></i></span> With Redirector: ' + campaignType.toUpperCase() + ' → Template → <strong>Redirector</strong> → Login → Final Redirect');
    } else {
        $("#redirectorOptions").css({ "opacity": "0.4", "pointer-events": "none" });
        $("#redirectorTemplatePanel").css({ "opacity": "0.4", "pointer-events": "none" });
        statusSpan.text("Disabled").css("color", "#999");

        // Hide redirector in flow diagram
        $(".flow-bypass-arrow").removeClass("hidden").show();
        $(".flow-redirector-item").removeClass("visible").hide();

        var campaignType = $("#campaign_type").val() || "Email";
        flowCaptionText.text('Direct flow: ' + campaignType.toUpperCase() + ' → Template → Login → Final Redirect');
    }
};

// --- Update Flow Diagram Labels ---
window.updateFlowDiagram = function () {
    var campaignType = $("#campaign_type").val() || "email";
    var templateName = $("#template_name").val() || "Select...";

    // Update campaign type in flow
    $("#flowCampaignType").text(campaignType.toUpperCase());

    // Update template name (truncate if too long)
    var displayName = templateName;
    if (displayName.length > 10) {
        displayName = displayName.substring(0, 8) + "...";
    }
    $("#flowTemplateName").text(displayName || "Select...");

    // Toggle icon based on campaign type
    var iconClass = "fa-envelope";
    if (campaignType === "sms") iconClass = "fa-commenting";
    if (campaignType === "qr") iconClass = "fa-qrcode";
    $(".flow-box.email-template i").attr("class", "fa " + iconClass);
};

// --- Load Cloudflare Domains for Redirector ---
// --- Load Cloudflare Domains (Dropdown) ---
var allDomains = [];
var selectedDomain = null;

function loadCloudflaireDomains() {
    $.ajax({
        url: "/api/simulationserver/config/fetch_alldomains",
        method: "GET",
        success: function (response) {
            var domains = response.data || response.domains || response || [];
            allDomains = Array.isArray(domains) ? domains : [];

            // Populate hidden select for compatibility (Redirector Step 3)
            var select = $("#redirectorDomain");
            select.find("option:not(:first)").remove();

            // Populate Phishlet Hostname Dropdown (Step 4)
            var selectPhishlet = $("#phishletHostname");
            selectPhishlet.find("option:not(:first)").remove();

            allDomains.forEach(function (domain) {
                if (domain.status === "active") {

                    var name = domain.name || domain;
                    var zoneId = domain.id || domain.ID || "";
                    select.append($("<option>").val(name).text(name).attr('data-zone-id', zoneId));
                    selectPhishlet.append($("<option>").val(name).text(name).attr('data-zone-id', zoneId));
                }
            });

            // Trigger change if we have a selected domain already
            if (selectedDomain) {
                selectPhishlet.val(selectedDomain).trigger("change");
            }
        },
        error: function (xhr) {
            console.error("Failed to load Cloudflare domains:", xhr.responseText);
        }
    });
}


// --- Load Redirector Templates (Card-based) ---
var allRedirectorTemplates = [];
var selectedRedirectorTemplate = null;

function loadRedirectorTemplates() {
    $.ajax({
        url: "/api/simulationserver/redirectors",
        method: "GET",
        success: function (response) {
            var redirectors = response.redirectors || response || [];
            allRedirectorTemplates = Array.isArray(redirectors) ? redirectors : [];
            renderRedirectorTemplateCards(allRedirectorTemplates);
        },
        error: function () {
            console.error("Failed to load redirector templates");
            $("#redirectorTemplateCards").html('<div class="col-md-12 text-center text-muted"><p>Failed to load templates</p></div>');
        }
    });
}

function renderRedirectorTemplateCards(templates) {
    var container = $("#redirectorTemplateCards");
    container.empty();

    if (!templates || templates.length === 0) {
        container.html('<div class="col-md-12 text-center text-muted" style="padding: 40px;"><i class="fa fa-inbox fa-3x"></i><p>No redirector templates found</p></div>');
        return;
    }

    templates.forEach(function (r) {
        var name = r.name || r;
        // Get HTML content - check multiple possible field names
        var htmlContent = '';
        if (r.html_escaped) {
            htmlContent = r.html_escaped;
        }

        // Escape quotes for srcdoc attribute (same as Step 2)
        var cleanHtml = (htmlContent || "").replace(/"/g, '&quot;');
        var isSelected = selectedRedirectorTemplate === name;
        var selectedClass = isSelected ? ' selected' : '';

        // Use exact same structure as Step 2 template cards
        var card = `
        <div class="col-md-4 col-sm-6">
            <div class="template-card redirector-template-card${selectedClass}" data-name="${name}">
                 <div class="template-header">
                    <div class="template-name" title="${name}">${name}</div>
                     <div class="template-type">
                        <button class="btn btn-success btn-xs preview-redirector-btn" data-name="${name}" onclick="event.stopPropagation();" title="Full Preview" style="padding: 4px 8px; font-size: 14px; font-weight: bold; border-width: 2px;">
                            FULL PREVIEW
                        </button>
                     </div>
                </div>
                <div class="template-preview">
                    <iframe srcdoc="${cleanHtml}" sandbox></iframe>
                </div>
                 <div class="template-footer">
                     <div class="template-actions">
                        <button class="btn btn-default btn-sm btn-action edit-redirector-btn" data-name="${name}" onclick="event.stopPropagation();" title="Edit">
                            <i class="fa fa-pencil"></i>
                        </button>
                        <button class="btn btn-default btn-sm btn-action copy-redirector-btn" data-name="${name}" onclick="event.stopPropagation();" title="Copy">
                            <i class="fa fa-copy"></i>
                        </button>
                        <button class="btn btn-danger btn-sm btn-action-delete delete-redirector-btn" data-name="${name}" onclick="event.stopPropagation();" title="Delete">
                             <i class="fa fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
        `;
        container.append(card);
    });

    // Card click to select
    $(".redirector-template-card").on("click", function (e) {
        if ($(e.target).hasClass('btn') || $(e.target).parent().hasClass('btn') || $(e.target).hasClass('fa')) return;
        var name = $(this).data("name");
        selectRedirectorTemplate(name);
    });

    // Preview button
    $(".preview-redirector-btn").on("click", function (e) {
        e.stopPropagation();
        var name = $(this).data("name");
        previewRedirectorTemplate(name);
    });

    // Edit button - open modal
    $(".edit-redirector-btn").on("click", function (e) {
        e.stopPropagation();
        var name = $(this).data("name");
        openRedirectorModal('edit', name);
    });

    // Copy button - open modal
    $(".copy-redirector-btn").on("click", function (e) {
        e.stopPropagation();
        var name = $(this).data("name");
        openRedirectorModal('copy', name);
    });

    // Delete button
    $(".delete-redirector-btn").on("click", function (e) {
        e.stopPropagation();
        var name = $(this).data("name");
        Swal.fire({
            title: "Delete Redirector?",
            text: "Are you sure you want to delete '" + name + "'?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d9534f",
            confirmButtonText: "Delete"
        }).then(function (result) {
            if (result.value) {
                $.ajax({
                    url: "/api/simulationserver/redirectors/" + encodeURIComponent(name),
                    method: "DELETE",
                    success: function () {
                        Swal.fire("Deleted!", "Redirector template deleted.", "success");
                        loadRedirectorTemplates();
                    },
                    error: function () {
                        Swal.fire("Error", "Failed to delete redirector template.", "error");
                    }
                });
            }
        });
    });
}

function selectRedirectorTemplate(name) {
    selectedRedirectorTemplate = name;
    $("#redirectorTemplate").val(name);
    renderRedirectorTemplateCards(allRedirectorTemplates);
}

function previewRedirectorTemplate(name) {
    var template = allRedirectorTemplates.find(function (r) { return (r.name || r) === name; });
    if (!template) return;

    var htmlContent = '';
    if (template.html_base64) {
        try { htmlContent = atob(template.html_base64); } catch (e) { }
    } else if (template.html) {
        htmlContent = template.html;
    }

    // Encode content as base64 for safe transport (XSS protection)
    var base64Content = btoa(unescape(encodeURIComponent(htmlContent)));

    // Use data URL with sandboxed iframe to prevent XSS
    var iframeSrc = 'data:text/html;base64,' + base64Content;

    Swal.fire({
        title: 'Preview: ' + escapeHtml(name),
        html: '<div style="height: 500px; overflow: auto; border: 1px solid #ddd; background: #fff;">' +
            '<iframe src="' + iframeSrc + '" sandbox="allow-same-origin" style="width: 100%; height: 100%; border: none;"></iframe>' +
            '</div>',
        width: 800,
        showCloseButton: true,
        showConfirmButton: false
    });
}

// --- Redirector Modal Functions ---
var currentRedirectorAssets = [];

window.openRedirectorModal = function (mode, name) {
    $("#redirectorModalMode").val(mode);
    $("#redirectorModalOriginalName").val(name || '');

    // Hide assets section by default
    $("#redirectorAssetsSection").hide();
    $("#redirectorAssetsContainer").empty();
    currentRedirectorAssets = [];

    if (mode === 'create') {
        $("#redirectorModalLabel").text("New Redirector Template");
        $("#redirectorModalName").val('');
        $("#redirectorModalHtml").val('');
        $("#redirectorModalPreview").attr('srcdoc', '');
    } else if (mode === 'edit' || mode === 'copy') {
        var template = allRedirectorTemplates.find(function (r) { return (r.name || r) === name; });
        if (!template) {
            Swal.fire("Error", "Template not found", "error");
            return;
        }

        var htmlContent = '';
        if (template.html_base64) {
            try { htmlContent = atob(template.html_base64); } catch (e) { }
        } else if (template.html) {
            htmlContent = template.html;
        }

        if (mode === 'edit') {
            $("#redirectorModalLabel").text("Edit Redirector: " + name);
            $("#redirectorModalName").val(name);
        } else {
            $("#redirectorModalLabel").text("Copy Redirector: " + name);
            $("#redirectorModalName").val(name + "_copy");
        }

        $("#redirectorModalHtml").val(htmlContent);

        // Render assets if available
        if (template.assets && template.assets.length > 0) {
            currentRedirectorAssets = template.assets;
            renderRedirectorAssets(template.assets);
        }

        // CKEditor will be initialized after modal shown
    }

    $("#redirectorModal").modal("show");
};

// Initialize CKEditor when redirector modal is shown
$("#redirectorModal").on("shown.bs.modal", function () {
    // Initialize CKEditor if not already initialized
    if (!CKEDITOR.instances.redirectorModalHtml) {
        CKEDITOR.replace('redirectorModalHtml', {
            height: 300,
            allowedContent: true,
            extraAllowedContent: '*(*);*{*}',
            fullPage: true,
            removeButtons: '',
            toolbar: [
                { name: 'document', items: ['Source'] },
                { name: 'clipboard', items: ['Cut', 'Copy', 'Paste', 'PasteText', 'PasteFromWord', '-', 'Undo', 'Redo'] },
                { name: 'editing', items: ['Find', 'Replace', '-', 'SelectAll'] },
                '/',
                { name: 'basicstyles', items: ['Bold', 'Italic', 'Underline', 'Strike', 'Subscript', 'Superscript', '-', 'RemoveFormat'] },
                { name: 'paragraph', items: ['NumberedList', 'BulletedList', '-', 'Outdent', 'Indent', '-', 'Blockquote', 'CreateDiv', '-', 'JustifyLeft', 'JustifyCenter', 'JustifyRight', 'JustifyBlock'] },
                { name: 'links', items: ['Link', 'Unlink', 'Anchor'] },
                { name: 'insert', items: ['Image', 'Table', 'HorizontalRule', 'SpecialChar'] },
                '/',
                { name: 'styles', items: ['Styles', 'Format', 'Font', 'FontSize'] },
                { name: 'colors', items: ['TextColor', 'BGColor'] },
                { name: 'tools', items: ['Maximize', 'ShowBlocks'] }
            ]
        });
    } else {
        // Update CKEditor with current textarea value
        CKEDITOR.instances.redirectorModalHtml.setData($("#redirectorModalHtml").val());
    }

    // Update preview after a short delay for CKEditor to initialize
    setTimeout(function () {
        updateRedirectorPreview();
    }, 100);
});

// Destroy CKEditor when modal is hidden to prevent issues
$("#redirectorModal").on("hidden.bs.modal", function () {
    if (CKEDITOR.instances.redirectorModalHtml) {
        CKEDITOR.instances.redirectorModalHtml.destroy();
    }
});

// Function to render assets in the modal
function renderRedirectorAssets(assets) {
    var container = $("#redirectorAssetsContainer");
    container.empty();

    if (!assets || assets.length === 0) {
        $("#redirectorAssetsSection").hide();
        return;
    }

    $("#redirectorAssetsSection").show();

    var assetHtml = '<div class="row" style="margin: 0;">';
    assets.forEach(function (asset, index) {
        var isImage = /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(asset.name);
        var mimeType = 'application/octet-stream';

        if (asset.name.endsWith('.svg')) mimeType = 'image/svg+xml';
        else if (asset.name.endsWith('.png')) mimeType = 'image/png';
        else if (asset.name.endsWith('.ico')) mimeType = 'image/x-icon';
        else if (asset.name.endsWith('.jpg') || asset.name.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (asset.name.endsWith('.gif')) mimeType = 'image/gif';
        else if (asset.name.endsWith('.webp')) mimeType = 'image/webp';

        assetHtml += '<div class="col-xs-4 col-sm-3" style="padding: 5px; text-align: center;">';
        assetHtml += '<div style="border: 1px solid #ddd; border-radius: 4px; padding: 5px; background: #fff; min-height: 80px;">';

        if (isImage) {
            assetHtml += '<img src="data:' + mimeType + ';base64,' + asset.base64 + '" ';
            assetHtml += 'style="max-width: 48px; max-height: 48px; margin-bottom: 5px;" alt="' + asset.name + '" />';
        } else {
            assetHtml += '<i class="fa fa-file-o" style="font-size: 32px; color: #666; margin-bottom: 5px;"></i>';
        }

        assetHtml += '<div style="font-size: 10px; word-break: break-all; color: #666;" title="' + asset.name + '">' + asset.name + '</div>';
        assetHtml += '<div style="font-size: 9px; color: #999;">' + formatAssetSize(asset.base64) + '</div>';
        assetHtml += '</div></div>';
    });
    assetHtml += '</div>';

    container.html(assetHtml);
}

// Helper function to format base64 size
function formatAssetSize(base64) {
    if (!base64) return '0 B';
    var bytes = Math.round((base64.length * 3) / 4);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

window.updateRedirectorPreview = function () {
    var html = "";
    if (CKEDITOR.instances.redirectorModalHtml) {
        html = CKEDITOR.instances.redirectorModalHtml.getData();
    } else {
        html = $("#redirectorModalHtml").val();
    }

    // Replace asset URLs with base64 data URIs
    if (currentRedirectorAssets && currentRedirectorAssets.length > 0) {
        currentRedirectorAssets.forEach(function (asset) {
            var mimeType = 'application/octet-stream';
            if (asset.name.endsWith('.svg')) mimeType = 'image/svg+xml';
            else if (asset.name.endsWith('.png')) mimeType = 'image/png';
            else if (asset.name.endsWith('.ico')) mimeType = 'image/x-icon';
            else if (asset.name.endsWith('.jpg') || asset.name.endsWith('.jpeg')) mimeType = 'image/jpeg';
            else if (asset.name.endsWith('.gif')) mimeType = 'image/gif';
            else if (asset.name.endsWith('.webp')) mimeType = 'image/webp';

            var dataUri = 'data:' + mimeType + ';base64,' + asset.base64;

            // Replace literal string matches
            // We use global replacement for exact filename matches in common attribute contexts
            var regex = new RegExp('([("\'])' + asset.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([("\'])', 'g');
            html = html.replace(regex, '$1' + dataUri + '$2');
        });
    }

    // Use srcdoc attribute instead of document.write to avoid sandbox permission issues
    $("#redirectorModalPreview").attr('srcdoc', html);
};

window.saveRedirectorModal = function () {
    var mode = $("#redirectorModalMode").val();
    var originalName = $("#redirectorModalOriginalName").val();
    var name = $("#redirectorModalName").val().trim();
    var html = "";
    if (CKEDITOR.instances.redirectorModalHtml) {
        html = CKEDITOR.instances.redirectorModalHtml.getData();
    } else {
        html = $("#redirectorModalHtml").val();
    }

    if (!name) {
        Swal.fire("Error", "Please enter a template name", "error");
        return;
    }
    if (!html) {
        Swal.fire("Error", "Please enter HTML content", "error");
        return;
    }

    var method = (mode === 'edit') ? 'PUT' : 'POST';
    // Use the proxied endpoint to the simulation server
    var url = (mode === 'edit')
        ? '/api/simulationserver/redirectors/' + encodeURIComponent(originalName)
        : '/api/simulationserver/redirectors';

    $.ajax({
        url: url,
        method: method,
        contentType: 'application/json',
        data: JSON.stringify({
            name: name,
            html: html
        }),
        success: function () {
            $("#redirectorModal").modal("hide");
            Swal.fire("Success", "Redirector template saved!", "success");
            loadRedirectorTemplates();
        },
        error: function (xhr) {
            var msg = xhr.responseJSON ? xhr.responseJSON.message : "Failed to save redirector template";
            Swal.fire("Error", msg, "error");
        }
    });
};

// Search filter for redirector templates
$(document).on("keyup", "#redirectorTemplateSearch", function () {
    var query = $(this).val().toLowerCase();
    var filtered = allRedirectorTemplates.filter(function (r) {
        var name = r.name || r;
        return name.toLowerCase().indexOf(query) !== -1;
    });
    renderRedirectorTemplateCards(filtered);
});

// --- Load Phishlets ---
var allPhishlets = [];
var selectedPhishlet = null;

function loadPhishlets() {
    $.ajax({
        url: "/api/phishlets",
        method: "GET",
        success: function (response) {
            var phishlets = response.phishlets || response || [];
            allPhishlets = Array.isArray(phishlets) ? phishlets : [];

            // Populate hidden select for compatibility
            var select = $("#phishletSelect");
            select.find("option:not(:first)").remove();
            allPhishlets.forEach(function (p) {
                var name = p.name || p;
                select.append($("<option>").val(name).text(name));
            });

            renderPhishletCards(allPhishlets);
        },
        error: function () {
            console.error("Failed to load phishlets");
            $("#phishletCards").html('<div class="col-md-12 text-center text-muted"><p>Failed to load phishlets</p></div>');
        }
    });
}

function renderPhishletCards(phishlets) {
    var container = $("#phishletCards");
    container.empty();

    if (!phishlets || phishlets.length === 0) {
        container.html('<div class="col-md-12 text-center text-muted" style="padding: 40px;"><i class="fa fa-search fa-3x"></i><p>No phishlets found matching your search</p></div>');
        return;
    }

    phishlets.forEach(function (p) {
        var name = p.name || p;
        var isSelected = (selectedPhishlet === name);
        var selectedClass = isSelected ? ' selected' : '';

        // Dynamic Icon and Preview Mapping
        var icon = "fa-shield";
        var brandClass = "";
        var nameLower = name.toLowerCase();
        // Default to checking for a file named after the phishlet (e.g., "example.png")
        // If not found, the onerror handler in the img tag will fallback to generic_preview.png
        var previewImg = "/images/phishlets/" + nameLower + ".png";

        if (nameLower.indexOf("google") !== -1 || nameLower.indexOf("gmail") !== -1) {
            icon = "fa-google";
            brandClass = " brand-google";
            previewImg = "/images/phishlets/google_preview.png";
        }
        else if (nameLower.indexOf("microsoft") !== -1 || nameLower.indexOf("o365") !== -1 || nameLower.indexOf("outlook") !== -1) {
            icon = "fa-windows";
            brandClass = " brand-microsoft";
            previewImg = "/images/phishlets/ms_office.png";
        }
        else if (nameLower.indexOf("linkedin") !== -1) {
            icon = "fa-linkedin";
            brandClass = " brand-linkedin";
            previewImg = "/images/phishlets/linkedin_preview.png";
        }
        else if (nameLower.indexOf("github") !== -1 || nameLower.indexOf("git") !== -1) {
            icon = "fa-github";
            brandClass = " brand-github";
            previewImg = "/images/phishlets/github.png";

        }
        else if (nameLower.indexOf("amazon") !== -1) {
            icon = "fa-amazon";
            brandClass = " brand-amazon";
        } else if (nameLower.indexOf("reddit") !== -1) {
            icon = "fa-reddit";
            brandClass = " brand-reddit";
            previewImg = "/images/phishlets/reddit.png";
        }
        else if (nameLower.indexOf("facebook") !== -1) {
            icon = "fa-facebook";
            brandClass = " brand-facebook";
        }
        else if (nameLower.indexOf("twitter") !== -1) {
            icon = "fa-twitter";
            brandClass = " brand-twitter";
        }
        else if (nameLower.indexOf("apple") !== -1) {
            icon = "fa-apple";
            brandClass = " brand-apple";
        }

        var card = `
        <div class="col-md-3 col-sm-4 mb-4">
            <div class="phishlet-card${selectedClass}" data-name="${name}">
                <div class="phishlet-preview-container">
                    <img src="${previewImg}" class="phishlet-preview-img" alt="${name} preview" 
                    onerror="if (!this.dataset.fallback) { this.dataset.fallback = true; this.src='/images/phishlets/generic_preview.png'; }">
                </div>
                <div class="phishlet-card-content">
                    <i class="fa ${icon} phishlet-icon${brandClass}"></i>
                    <div class="phishlet-name" title="${name}">${name}</div>
                </div>
            </div>
        </div>`;
        container.append(card);
    });
}

// Search filter for phishlets
$(document).on("keyup", "#phishletSearch", function () {
    var query = $(this).val().toLowerCase();
    var filtered = allPhishlets.filter(function (p) {
        var name = p.name || p;
        return name.toLowerCase().indexOf(query) !== -1;
    });
    renderPhishletCards(filtered);
});

// Selection handler for phishlet cards
$(document).on("click", ".phishlet-card", function () {
    var name = $(this).data("name");

    // Update global state
    selectedPhishlet = name;

    // Update UI
    $(".phishlet-card").removeClass("selected");
    $(this).addClass("selected");

    // Update hidden select and trigger change to fire existing configuration logic
    $("#phishletSelect").val(name).trigger("change");
});

// --- Phishlet Selection Handler ---
$("#phishletSelect").on("change", function () {
    var selected = $(this).val();
    if (selected) {
        $("#phishletConfigPanel").show();
        loadPhishletConfig(selected);

        // If a hostname is already selected in the dropdown, trigger the provisioning logic
        var currentHostname = $("#phishletHostname").val();
        if (currentHostname && currentHostname !== "") {

            $("#phishletHostname").trigger("change");
        }
    } else {
        $("#phishletConfigPanel").hide();
    }
});

// Auto-enable the selected phishlet and disable all others
function autoEnablePhishlet(phishletName, callback) {
    // Get the redirector domain from Step 3 for landing_domain
    var redirectorDomain = $("#redirectorDomain").val();
    var useRedirector = $("#useRedirector").is(":checked");
    var landingDomainToSet = useRedirector ? (redirectorDomain || "") : "";

    $.ajax({
        url: "/api/simulationserver/modules",
        method: "GET",
        success: function (data) {
            var modules = data.modules || data;
            if (!Array.isArray(modules)) return;

            var togglePromises = [];
            var selectedModule = modules.find(function (m) { return m.name == phishletName; });
            var selectedIsEnabled = selectedModule && (selectedModule.status == "enabled" || selectedModule.enabled === true);

            // 1. First disable all OTHER enabled phishlets
            modules.forEach(function (m) {
                var isEnabled = m.status == "enabled" || m.enabled === true;
                if (isEnabled && m.name != phishletName) {
                    togglePromises.push($.post("/api/simulationserver/modules/" + encodeURIComponent(m.name) + "/toggle"));
                }
            });

            // Set landing_domain first
            $.ajax({
                url: "/api/simulationserver/modules/" + encodeURIComponent(phishletName) + "/landing_domain",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({ landing_domain: landingDomainToSet }),
                success: function () {

                }
            });

            // Wait for all disables to complete before enabling the target
            $.when.apply($, togglePromises).always(function () {
                if (!selectedIsEnabled) {
                    $.post("/api/simulationserver/modules/" + encodeURIComponent(phishletName) + "/toggle", function (response) {
                        if (response.success) {
                            showPhishletEnabledToast(phishletName);
                        }
                        if (typeof callback === "function") callback();
                    });
                } else {
                    showPhishletEnabledToast(phishletName);
                    if (typeof callback === "function") callback();
                }
            });
        }
    });
}

function showPhishletEnabledToast(phishletName) {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000
    });
    Toast.fire({
        icon: 'success',
        title: 'Phishlet "' + phishletName + '" enabled'
    });
}

function loadPhishletHosts(name) {
    if (!name) return;
    $("#phishletHostsLoading").show();
    $("#phishletHostsList").empty();

    $.ajax({
        url: "/api/simulationserver/modules/" + encodeURIComponent(name) + "/hosts",
        method: "GET",
        success: function (data) {
            $("#phishletHostsLoading").hide();
            var hosts = data.hosts || [];
            if (hosts.length > 0) {
                hosts.forEach(function (host) {
                    $("#phishletHostsList").append("<li>" + host + "</li>");
                });
            } else {
                $("#phishletHostsList").append("<li><em>No hosts configured</em></li>");
            }
        },
        error: function () {
            $("#phishletHostsLoading").hide();
            $("#phishletHostsList").append("<li class='text-danger'>Failed to load hosts</li>");
        }
    });
}

function loadPhishletConfig(name) {

    // Load Module Details
    $.ajax({
        url: "/api/simulationserver/modules",
        method: "GET",
        success: function (data) {
            var modules = data.modules || data;
            if (Array.isArray(modules)) {
                var module = modules.find(function (m) { return m.name == name; });
                if (module) {
                    var hostname = module.hostname || "";
                    if (hostname && hostname !== "") {
                        if ($("#phishletHostname option[value='" + hostname + "']").length === 0) {
                            $("#phishletHostname").append($("<option>").val(hostname).text(hostname));
                        }
                        $("#phishletHostname").val(hostname).trigger('change.select2');
                    }
                    $("#phishletLandingDomain").val(module.landing_domain || "");

                    var badge = $("#phishletStatusBadge");
                    var isEnabled = module.status == "enabled" || module.enabled === true;

                    if (isEnabled) {
                        badge.removeClass("label-default label-danger").addClass("label-success").text("Enabled");
                    } else {
                        badge.removeClass("label-success label-default").addClass("label-danger").text("Disabled");
                    }
                }
            }
        }
    });

    // Load Hosts
    loadPhishletHosts(name);
}

// --- Configuration Handlers ---

// Note: phishletStatusToggle removed - phishlets are now auto-enabled on selection


// Show Authorized Hosts on Click
$("#phishletHostname").on("click", function (e) {
    e.stopPropagation();
    $("#phishletHostsContainer").show();
});



$(document).on("click", function (e) {
    if (!$(e.target).closest("#phishletHostname").length && !$(e.target).closest("#phishletHostsContainer").length) {
        $("#phishletHostsContainer").hide();
    }
});

// Save Hostname on Selection
$("#phishletHostname").on("change", function () {
    var name = $("#phishletSelect").val();
    var hostname = $(this).val();
    if (!name || !hostname) return;

    // 1. Set Global Domain and Wait
    $.ajax({
        url: "/api/simulationserver/config/domain",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ domain: hostname }),
        success: function () {

            provisionRedirectorSSL(hostname);

            // 2. Set Phishlet Hostname (Only after #1 succeeds)
            $.ajax({
                url: "/api/simulationserver/modules/" + encodeURIComponent(name) + "/hostname",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({ hostname: hostname }),
                success: function () {
                    const Toast = Swal.mixin({
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 3000
                    });
                    Toast.fire({
                        icon: 'success',
                        title: 'Phishlet hostname set to ' + hostname
                    });

                    loadPhishletHosts(name);
                    // 3. Auto-create DNS records for all phishlet hosts
                    autoCreateDNSRecords(name, hostname);
                    // 4. Enable the phishlet (and disable others)
                    autoEnablePhishlet(name);

                    // 5. Auto-create a default lure with random path
                    autoCreateDefaultLure(name, hostname);
                },
                error: function () {
                    Swal.fire("Error", "Failed to update phishlet hostname.", "error");
                }
            });
        },
        error: function () {
            console.error("Failed to update global domain");
            Swal.fire("Error", "Failed to update global domain.", "error");
        }
    });

});
// Save IPv4
$("#saveIPv4Btn").on("click", function () {
    var ip = $("#serverIPv4").val();

    $.ajax({
        url: "/api/simulationserver/config/ipv4",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ external: ip }), // Updated key to 'external'
        success: function () {
            Swal.fire("Saved", "Server IP updated.", "success");
        },
        error: function () {
            Swal.fire("Error", "Failed to update IP.", "error");
        }
    });
});

// Add Cloudflare DNS Record
$("#addSubdomainDNSBtn").on("click", function () {
    var hostname = $("#phishletHostname").val();
    var ip = $("#serverIPv4").val();
    var domain = $("#redirectorDomain").val(); // Assuming validation against this or 

    if (!hostname || !ip) {
        Swal.fire("Error", "Please set Hostname and IP first.", "warning");
        return;
    }

    Swal.fire({
        title: "Creating DNS Record...",
        text: "Adding A record for " + hostname + " -> " + ip,
        onBeforeOpen: () => { Swal.showLoading() }
    });

    getZoneIdForDomain(hostname).then(function (zoneId) {
        if (!zoneId) {
            Swal.fire("Error", "Could not determine Zone ID for " + hostname, "error");
            return;
        }

        $.ajax({
            url: "/api/simulationserver/config/create_dns_record",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({
                zone_id: zoneId,
                name: hostname,
                content: ip,
                type: "A",
                proxied: true // Default to false? User said "IP", usually means direct A record.
            }),
            success: function () {
                Swal.fire("Success", "DNS Record created.", "success");
            },
            error: function (xhr) {
                Swal.fire("Error", "Failed to create DNS record: " + (xhr.responseJSON ? xhr.responseJSON.message : xhr.statusText), "error");
            }
        });
    });
});

// Auto-create DNS A records for all phishlet hosts using the EC2 public IP
function autoCreateDNSRecords(phishletName, hostname) {
    // Show progress notification
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 5000
    });
    Toast.fire({
        icon: 'info',
        title: 'Setting up DNS records...'
    });

    // Fetch EC2 IP from status API (EC2 was already started on "New Campaign" click)
    $.ajax({
        url: "/api/simulationserver/ec2/status",
        method: "GET",
        success: function (statusResponse) {
            var ec2IP = statusResponse.data && statusResponse.data.public_ip;
            if (!ec2IP) {
                Toast.fire({
                    icon: 'warning',
                    title: 'EC2 not running - no public IP available'
                });
                return;
            }

            // Set Global IPv4 Config using the EC2 IP
            $.ajax({
                url: "/api/simulationserver/config/ipv4",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({ external: ec2IP }),
                success: function () {
                },
                error: function () {
                    console.error("Failed to update global IPv4");
                }
            });

            createDNSRecordsWithIP(phishletName, hostname, ec2IP, Toast);
        },
        error: function () {
            Toast.fire({
                icon: 'error',
                title: 'Failed to get EC2 status'
            });
        }
    });
}

// Helper function to create DNS records with the given IP
function createDNSRecordsWithIP(phishletName, hostname, ec2IP, Toast) {
    // 1. Get phishlet hosts
    $.ajax({
        url: "/api/simulationserver/modules/" + encodeURIComponent(phishletName) + "/hosts",
        method: "GET",
        success: function (hostData) {
            var hosts = hostData.hosts || [];
            if (hosts.length === 0) {
                return;
            }


            // 2. Get zone_id from domains (using cached allDomains)
            var zones = allDomains || [];

            // If allDomains is empty, fallback to fetch (safety mechanism)
            if (zones.length === 0) {
                $.ajax({
                    url: "/api/simulationserver/config/fetch_alldomains",
                    method: "GET",
                    success: function (domainData) {
                        zones = domainData.data || domainData.domains || domainData || [];
                        allDomains = zones; // Update cache
                        var matchingZone = zones.find(function (z) {
                            return hostname.endsWith(z.name);
                        });
                        proceedWithValidation(matchingZone);
                    },
                    error: function () {
                        Toast.fire({
                            icon: 'error',
                            title: 'Failed to fetch Cloudflare domains'
                        });
                    }
                });
                return;
            }

            var matchingZone = zones.find(function (z) {
                return hostname.endsWith(z.name);
            });
            proceedWithValidation(matchingZone);

            function proceedWithValidation(matchingZone) {
                if (!matchingZone) {
                    console.error("Could not find matching Cloudflare zone for", hostname);
                    Toast.fire({
                        icon: 'warning',
                        title: 'Could not find Cloudflare zone for ' + hostname
                    });
                    return;
                }

                var zoneId = matchingZone.id;


                // 3. Create A record for each host
                var createdCount = 0;
                var errorCount = 0;

                hosts.forEach(function (host) {
                    $.ajax({
                        url: "/api/simulationserver/config/create_dns_record",
                        method: "POST",
                        contentType: "application/json",
                        data: JSON.stringify({
                            zone_id: zoneId,
                            name: host,
                            content: ec2IP,
                            type: "A",
                            proxied: true
                        }),
                        success: function () {
                            createdCount++;

                            if (createdCount + errorCount === hosts.length) {
                                showDNSCompletionMessage(createdCount, errorCount);
                            }
                        },
                        error: function (xhr) {
                            // Check if record already exists - treat as success/skip
                            var response = xhr.responseJSON || {};
                            if (response.message && response.message.indexOf("already exists") > -1) {
                                createdCount++; // Count as success (record exists)

                            } else {
                                errorCount++;
                                console.error("Failed to create DNS record for:", host, xhr.responseText);
                            }
                            if (createdCount + errorCount === hosts.length) {
                                showDNSCompletionMessage(createdCount, errorCount);
                            }
                        }
                    });
                });
            }
        },
        error: function () {
            Toast.fire({
                icon: 'error',
                title: 'Failed to get phishlet hosts'
            });
        }
    });
}

// Auto-create a default lure with random path when domain is selected
function autoCreateDefaultLure(phishletName, hostname) {
    // Generate a random path (8 alphanumeric characters)
    var randomPath = generateRandomPath(8);

    // Check if redirector is enabled and get selected redirector template name
    var useRedirector = $("#useRedirector").is(":checked");
    // Try global variable first, fallback to hidden input field
    var redirectorName = null;
    if (useRedirector) {
        redirectorName = selectedRedirectorTemplate || $("#redirectorTemplate").val() || null;
    }

    // Create the lure
    $.ajax({
        url: '/api/simulationserver/strikes/create',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ module: phishletName }),
        success: function (data) {
            if (data.success) {
                // Update the lure with the random path (and redirector if selected)
                setTimeout(function () {
                    getStrikes().then(function (strikesData) {
                        if (strikesData && strikesData.success && strikesData.data) {
                            var strikes = strikesData.data;
                            if (strikes.length > 0) {
                                // Sort by ID desc to get latest
                                strikes.sort(function (a, b) { return b.id - a.id });
                                var latest = strikes[0];

                                // Build edit payload
                                var editPayload = { path: "/" + randomPath };
                                if (redirectorName) {
                                    editPayload.redirector = redirectorName;
                                }

                                // Update with random path and optional redirector
                                $.ajax({
                                    url: '/api/simulationserver/strikes/' + latest.id + '/edit',
                                    type: 'POST',
                                    contentType: 'application/json',
                                    data: JSON.stringify(editPayload),
                                    success: function () {
                                        // Fetch the latest strikes again to get the final generated URL from the backend
                                        getStrikes().then(function (finalStrikesData) {
                                            var finalUrl = "https://login." + hostname + "/" + randomPath; // High-level fallback

                                            if (finalStrikesData && finalStrikesData.success && finalStrikesData.data) {
                                                var updatedLure = finalStrikesData.data.find(function (s) { return s.id == latest.id; });
                                                if (updatedLure) {
                                                    // Use landing_url if available (contains redirector info), otherwise use url
                                                    finalUrl = updatedLure.landing_url || updatedLure.url || finalUrl;
                                                }
                                            }

                                            // Update all relevant UI fields
                                            $("#lureList").val(finalUrl);
                                            $("#selectedLureId").val(latest.id);
                                            $("#manualLureUrl").val(finalUrl);
                                            $("#currentLureDisplay").val(finalUrl);

                                            const Toast = Swal.mixin({
                                                toast: true,
                                                position: 'top-end',
                                                showConfirmButton: false,
                                                timer: 3000
                                            });

                                            var toastMsg = 'Default lure created: /' + randomPath;
                                            if (redirectorName) {
                                                toastMsg += ' (with redirector: ' + redirectorName + ')';
                                            }
                                            Toast.fire({
                                                icon: 'success',
                                                title: toastMsg
                                            });

                                            // Refresh lures table to show the new entry
                                            refreshLures();
                                        });
                                    },
                                    error: function () {
                                        console.error("Failed to set lure path");
                                    }
                                });
                            }
                        }
                    });
                }, 500);
            } else {
                console.error("Failed to create lure:", data.error);
            }
        },
        error: function () {
            console.error("Failed to create default lure");
        }
    });
}

// Generate a random alphanumeric path
function generateRandomPath(length) {
    var chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    var result = '';
    for (var i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function showDNSCompletionMessage(created, errors) {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 5000
    });
    if (errors === 0) {
        Toast.fire({
            icon: 'success',
            title: 'Created ' + created + ' DNS records successfully!'
        });
    } else {
        Toast.fire({
            icon: 'warning',
            title: 'Created ' + created + ' DNS records, ' + errors + ' failed'
        });
    }
}

function getZoneIdForDomain(hostname) {
    return new Promise(function (resolve, reject) {
        // Simple heuristic: match subdomain to parent domain in #redirectorDomain?
        // Or fetch domains list.
        $.get("/api/simulationserver/domains", function (data) {
            // data.result is list of zones
            var zones = data.result || [];
            // Find which zone the hostname belongs to
            var zone = zones.find(function (z) {
                return hostname.endsWith(z.name);
            });
            resolve(zone ? zone.id : null);
        }).fail(function () { resolve(null); });
    });
}

// Update phishlet landing domain when redirector domain changes
$(document).on("change", "#redirectorDomain", function () {
    var domain = $(this).val();

    // Show/hide subdomain option based on domain selection
    if (domain) {
        $("#subdomainOption").show();
        // Reset subdomain fields when domain changes
        $("#useSubdomain").prop("checked", false);
        $("#subdomainInput").val("").hide();
        $("#setSubdomainBtn").hide();
        $("#subdomainHelp").hide();
        // Store the base domain for subdomain logic
        $(this).data("baseDomain", domain);
        // Show email URL preview with the selected domain
        updateEmailUrlPreview(domain);

        // Provision SSL certificate for the redirector domain
        provisionRedirectorSSL(domain, "");
    } else {
        $("#subdomainOption").hide();
        $("#emailUrlPreview").hide();
    }

    updatePhishletLandingDomain();
});

// Toggle subdomain input visibility when checkbox changes
$(document).on("change", "#useSubdomain", function () {
    if ($(this).is(":checked")) {
        $("#subdomainInput").show();
        $("#setSubdomainBtn").show();
        $("#subdomainHelp").show();
    } else {
        // Uncheck - revert to main domain
        $("#subdomainInput").val("").hide();
        $("#setSubdomainBtn").hide();
        $("#subdomainHelp").hide();

        // Restore base domain
        var baseDomain = $("#redirectorDomain").data("baseDomain");
        if (baseDomain) {
            // Update the select to show base domain
            $("#redirectorDomain").val(baseDomain);
            updatePhishletLandingDomain();
        }
    }
});

// Set the subdomain and update the effective redirector domain
function setRedirectorSubdomain() {
    var baseDomain = $("#redirectorDomain").data("baseDomain") || $("#redirectorDomain").val();
    var subdomain = $("#subdomainInput").val().trim();

    if (!subdomain) {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'Please enter a subdomain',
            showConfirmButton: false,
            timer: 3000
        });
        return;
    }

    // Build full subdomain domain
    var fullDomain = subdomain + "." + baseDomain;

    // Update the dropdown to show the full subdomain (add as option if needed)
    var select = $("#redirectorDomain");
    if (select.find("option[value='" + fullDomain + "']").length === 0) {
        select.append($("<option>").val(fullDomain).text(fullDomain + " (subdomain)"));
    }
    select.val(fullDomain);

    // Update phishlet landing domain
    updatePhishletLandingDomain();

    // Create DNS A record for the subdomain with EC2 IP
    createRedirectorDNSRecord(fullDomain, baseDomain);

    // Update the email URL preview
    updateEmailUrlPreview(fullDomain);

    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Subdomain set: ' + fullDomain,
        showConfirmButton: false,
        timer: 3000
    });
}

// Update the Email URL preview in Step 3
function updateEmailUrlPreview(domain) {
    if (domain) {
        // Show the preview and set the URL (just domain + random path placeholder)
        $("#emailUrlPreviewValue").val("https://" + domain + "/<random-path>");
        $("#emailUrlPreview").show();
    } else {
        $("#emailUrlPreview").hide();
    }
}

// Copy Email URL to clipboard
function copyEmailUrl() {
    var emailUrl = $("#emailUrlPreviewValue").val();
    if (emailUrl) {
        navigator.clipboard.writeText(emailUrl).then(function () {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Email URL copied!',
                showConfirmButton: false,
                timer: 2000
            });
        });
    }
}

// Create DNS A record for redirector domain with EC2 IP
function createRedirectorDNSRecord(fullDomain, baseDomain) {
    const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 5000
    });

    Toast.fire({
        icon: 'info',
        title: 'Creating DNS record for redirector...'
    });

    // Get EC2 IP from status API
    $.ajax({
        url: "/api/simulationserver/ec2/status",
        method: "GET",
        success: function (statusResponse) {
            var ec2IP = statusResponse.data && statusResponse.data.public_ip;
            if (!ec2IP) {
                Toast.fire({
                    icon: 'warning',
                    title: 'EC2 not running - cannot create DNS record'
                });
                return;
            }

            // Get zone_id for the base domain (using cached allDomains)
            var zones = allDomains || [];

            if (zones.length === 0) {
                // Fallback fetch if cache empty
                $.ajax({
                    url: "/api/simulationserver/config/fetch_alldomains",
                    method: "GET",
                    success: function (domainData) {
                        zones = domainData.data || domainData.domains || domainData || [];
                        allDomains = zones;
                        var matchingZone = zones.find(function (z) {
                            return baseDomain === z.name || baseDomain.endsWith("." + z.name);
                        });
                        proceedWithCreateLure(matchingZone);
                    },
                    error: function () {
                        Toast.fire({
                            icon: 'error',
                            title: 'Failed to fetch Cloudflare domains'
                        });
                    }
                });
                return;
            }

            var matchingZone = zones.find(function (z) {
                return baseDomain === z.name || baseDomain.endsWith("." + z.name);
            });
            proceedWithCreateLure(matchingZone);

            function proceedWithCreateLure(matchingZone) {
                if (!matchingZone) {
                    Toast.fire({
                        icon: 'warning',
                        title: 'Could not find Cloudflare zone for ' + baseDomain
                    });
                    return;
                }

                var zoneId = matchingZone.id;

                // Create DNS A record for the redirector domain
                $.ajax({
                    url: "/api/simulationserver/config/create_dns_record",
                    method: "POST",
                    contentType: "application/json",
                    data: JSON.stringify({
                        zone_id: zoneId,
                        name: fullDomain,
                        content: ec2IP,
                        type: "A",
                        proxied: true
                    }),
                    success: function () {
                        Toast.fire({
                            icon: 'success',
                            title: 'DNS record created: ' + fullDomain
                        });
                    },
                    error: function (xhr) {
                        var response = xhr.responseJSON || {};
                        if (response.message && response.message.indexOf("already exists") > -1) {
                            Toast.fire({
                                icon: 'info',
                                title: 'DNS record already exists for ' + fullDomain
                            });
                        } else {
                            Toast.fire({
                                icon: 'error',
                                title: 'Failed to create DNS record: ' + (response.message || xhr.statusText)
                            });
                        }
                    }
                });
            }
        },
        error: function () {
            Toast.fire({
                icon: 'error',
                title: 'Failed to get EC2 status'
            });
        }
    });
}

// Function to update phishlet landing domain
function updatePhishletLandingDomain() {
    var phishlet = $("#phishletSelect").val();
    var domain = $("#redirectorDomain").val();
    var useRedirector = $("#useRedirector").is(":checked");

    if (useRedirector && phishlet && domain) {

        $.ajax({
            url: "/api/simulationserver/modules/" + encodeURIComponent(phishlet) + "/landing_domain",
            method: "POST",
            contentType: "application/json",
            data: JSON.stringify({ landing_domain: domain }),
            success: function () {

                const Toast = Swal.mixin({
                    toast: true,
                    position: 'top-end',
                    showConfirmButton: false,
                    timer: 3000
                });
                Toast.fire({
                    icon: 'success',
                    title: 'Updated phishlet domain to ' + domain
                });
            },
            error: function (xhr) {
                console.error("Failed to update phishlet landing domain", xhr);
            }
        });
    }
}

// Populate tracking domain dropdown for Step 5 (Tracking only mode)
function populateTrackingDomains() {
    var $trackingDomain = $("#trackingDomain");
    $trackingDomain.html('<option value="">-- Select Domain --</option>');

    // Use existing Cloudflare domains if already loaded
    var $redirectorDomain = $("#redirectorDomain");
    $redirectorDomain.find("option").each(function () {
        var val = $(this).val();
        var text = $(this).text();
        var zoneId = $(this).attr('data-zone-id') || "";
        if (val) {
            $trackingDomain.append($("<option>").val(val).text(text).attr('data-zone-id', zoneId));
        }
    });

    // If no domains, try to load them
    if ($trackingDomain.find("option").length <= 1) {
        $.get("/api/simulationserver/config/fetch_alldomains", function (response) {
            if (response.success && response.data) {
                response.data.forEach(function (domain) {
                    if (domain.status == "active") {

                        var zoneId = domain.id || domain.ID || "";
                        $trackingDomain.append($("<option>").val(domain.name).text(domain.name).attr('data-zone-id', zoneId));
                    }
                });
            }
        });
    }
}

$(document).on("change", "#trackingDomain", function () {
    var domain = $(this).val();

    if (domain) {
        $("#trackingSubdomainOption").show();
        // Reset subdomain fields
        $("#useTrackingSubdomain").prop("checked", false);
        $("#trackingSubdomainInput").val("").hide();
        $("#setTrackingSubdomainBtn").hide();
        $("#trackingSubdomainHelp").hide();
        // Store base domain
        $(this).data("baseDomain", domain);

        // AUTO-SET DEFAULT SUBDOMAIN 'track'
        var defaultSub = "";

        // Update UI
        // $("#useTrackingSubdomain").prop("checked", false);
        // $("#trackingSubdomainInput").val(defaultSub).hide();
        // $("#setTrackingSubdomainBtn").hide();
        // $("#trackingSubdomainHelp").hide();

        // 1. Set phishlet subdomain to 'track'
        $.ajax({
            url: "/api/simulationserver/phishlets/example",
            method: "PUT",
            contentType: "application/json",
            data: JSON.stringify({ phish_sub: defaultSub }),
            success: function () {


                // 2. Create DNS A record for track.domain.com (NOT base domain)
                var fullDomain = domain;
                createRedirectorDNSRecord(fullDomain, domain);

                // 3. Create lure (will use the updated phishlet config)
                createTrackingLureForDomain(domain);

                // 4. Provision SSL certificate in background
                var zoneId = $(this).find("option:selected").attr("data-zone-id") || "";

                // Call provisioning - backend will lookup zoneId if missing
                provisionSSLCertificate(domain, zoneId, "example");
            },
            error: function () {
                console.error("Failed to set default subdomain");
                // Fallback: try to create lure anyway
                createTrackingLureForDomain(domain);
            }
        });
    } else {
        $("#trackingSubdomainOption").hide();
    }
});

// Toggle tracking subdomain input visibility
$(document).on("change", "#useTrackingSubdomain", function () {
    if ($(this).is(":checked")) {
        $("#trackingSubdomainInput").show();
        $("#setTrackingSubdomainBtn").show();
        $("#trackingSubdomainHelp").show();
    } else {
        $("#trackingSubdomainInput").val("").hide();
        $("#setTrackingSubdomainBtn").hide();
        $("#trackingSubdomainHelp").hide();

        // Restore base domain
        var baseDomain = $("#trackingDomain").data("baseDomain");
        if (baseDomain) {
            $("#trackingDomain").val(baseDomain);
        }
    }
});
// Create lure for tracking mode when domain is selected in Step 5
// This is triggered when main domain is selected or subdomain is set
function createTrackingLureForDomain(trackingDomain) {
    var randomPath = generateRandomPath(8);

    // Get redirector from Step 3 if it was set
    var useRedirector = $("#useRedirector").is(":checked");
    var redirectorDomain = $("#redirectorDomain").val() || "";
    var redirectorName = selectedRedirectorTemplate || $("#redirectorTemplate").val() || null;

    // Extract the base TLD domain (e.g., test.prprzo.com -> prprzo.com)
    // Get the stored base domain from tracking domain dropdown, or extract from trackingDomain
    var baseDomain = $("#trackingDomain").data("baseDomain") || trackingDomain;

    // First set the global domain in evilginx (use base TLD only)
    $.ajax({
        url: "/api/simulationserver/config/domain",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({ domain: baseDomain }),
        success: function () {
            // [NEW] Set Phishlet Hostname for 'example'
            $.ajax({
                url: "/api/simulationserver/modules/example/hostname",
                method: "POST",
                contentType: "application/json",
                data: JSON.stringify({ hostname: trackingDomain }),
                success: function () {

                },
                error: function () {
                    console.error("Failed to set example phishlet hostname");
                }
            });
        },
        error: function () {
            console.error("Failed to set global domain");
        }
    });

    // Set global domain and phishlet configuration via autoEnablePhishlet
    autoEnablePhishlet("example", function () {
        // After "example" phishlet is enabled (and others disabled)
        createTrackingLureWithRedirector(randomPath, trackingDomain, useRedirector, redirectorDomain, redirectorName);
    });
}

// Auto-create lure for tracking only mode with random path (legacy function, kept for compatibility)
function autoCreateTrackingLure() {
    var trackingDomain = $("#trackingDomain").val() || "";
    if (trackingDomain) {
        createTrackingLureForDomain(trackingDomain);
    }
}

// Helper function to create tracking lure with redirector support
function createTrackingLureWithRedirector(randomPath, trackingDomain, useRedirector, redirectorDomain, redirectorName) {
    $.ajax({
        url: '/api/simulationserver/strikes/create',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ module: "example" }),
        success: function (data) {
            if (data.success) {
                // Get the created lure and update with random path and redirector
                setTimeout(function () {
                    getStrikes().then(function (strikesData) {
                        if (strikesData && strikesData.success && strikesData.data) {
                            var strikes = strikesData.data;
                            if (strikes.length > 0) {
                                // Sort by ID desc to get latest
                                strikes.sort(function (a, b) { return b.id - a.id });
                                var latest = strikes[0];

                                // Build edit payload with path and optional redirector
                                var editPayload = { path: "/" + randomPath };
                                if (useRedirector && redirectorName) {
                                    editPayload.redirector = redirectorName;
                                }

                                // Update with random path and optional redirector
                                $.ajax({
                                    url: '/api/simulationserver/strikes/' + latest.id + '/edit',
                                    type: 'POST',
                                    contentType: 'application/json',
                                    data: JSON.stringify(editPayload),
                                    success: function () {
                                        // Fetch updated strikes to get actual URL from server
                                        setTimeout(function () {
                                            getStrikes().then(function (updatedData) {
                                                if (updatedData && updatedData.success && updatedData.data) {
                                                    // Find the lure we just created
                                                    var lure = updatedData.data.find(function (s) { return s.id === latest.id; });
                                                    if (lure) {
                                                        // Get the actual lure URL (for tracking - this goes in campaign.url)
                                                        var actualLureUrl = lure.url || "";

                                                        // Determine which URL to display to user:
                                                        // If redirector is set, show redirector URL (landing_url)
                                                        // Otherwise show the normal lure URL
                                                        var displayUrl = "";
                                                        if (useRedirector && redirectorDomain) {
                                                            // Build redirector URL with the path
                                                            displayUrl = "https://" + redirectorDomain + "/" + randomPath;
                                                        } else {
                                                            // Use landing_url if exists, otherwise use url
                                                            displayUrl = lure.landing_url || lure.url || "";
                                                        }

                                                        // Store lure info - actualLureUrl for campaign.url, displayUrl for display
                                                        $("#selectedLureId").val(latest.id);
                                                        $("#actualLureUrl").val(actualLureUrl); // Actual lure URL for tracking
                                                        $("#manualLureUrl").val(displayUrl); // Display URL (redirector if enabled)

                                                        // Display in Step 5 - Always show the actual lure URL
                                                        $("#trackingLureUrl").val(actualLureUrl);
                                                        $("#trackingLureDisplay").show();

                                                        const Toast = Swal.mixin({
                                                            toast: true,
                                                            position: 'top-end',
                                                            showConfirmButton: false,
                                                            timer: 3000
                                                        });

                                                        var toastMsg = 'Tracking lure created';
                                                        if (useRedirector && redirectorName) {
                                                            toastMsg += ' (with redirector)';
                                                        }
                                                        // Generate QR code for the new lure if in QR mode
                                                        if ($("#campaign_type").val() === "qr") {
                                                            // Use displayUrl (redirector if enabled) for QR
                                                            generateQR(displayUrl);
                                                        }

                                                        Toast.fire({
                                                            icon: 'success',
                                                            title: toastMsg
                                                        });
                                                    }
                                                }
                                            });
                                        }, 300);
                                    }
                                });
                            }
                        }
                    });
                }, 500);
            }
        },
        error: function () {
            console.error("Failed to create tracking lure");
        }
    });
}

// Legacy function - kept for compatibility
function createTrackingLureWithPath(randomPath) {
    createTrackingLureWithRedirector(randomPath, "", false, "", null);
}

// Set tracking subdomain
function setTrackingSubdomain() {
    var baseDomain = $("#trackingDomain").data("baseDomain") || $("#trackingDomain").val();
    var subdomain = $("#trackingSubdomainInput").val().trim();

    if (!subdomain) {
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'warning',
            title: 'Please enter a subdomain',
            showConfirmButton: false,
            timer: 3000
        });
        return;
    }

    var fullDomain = subdomain + "." + baseDomain;

    var select = $("#trackingDomain");
    if (select.find("option[value='" + fullDomain + "']").length === 0) {
        select.append($("<option>").val(fullDomain).text(fullDomain + " (subdomain)"));
    }
    select.val(fullDomain);

    // Call backend API to update phish_sub on the simulation server
    $.ajax({
        url: "/api/simulationserver/phishlets/example",
        method: "PUT",
        contentType: "application/json",
        data: JSON.stringify({
            phish_sub: subdomain
        }),
        success: function (response) {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Tracking subdomain set: ' + fullDomain,
                showConfirmButton: false,
                timer: 3000
            });

            // Create DNS A record for the subdomain with EC2 IP
            createRedirectorDNSRecord(fullDomain, baseDomain);

            // Update the displayed lure URL with the new subdomain (don't create new lure)
            updateTrackingLureUrlDisplay(fullDomain);

            // Trigger SSL provisioning for the subdomain
            var zoneId = $("#trackingDomain").find("option:selected").attr("data-zone-id");
            if (zoneId) {
                provisionSSLCertificate(fullDomain, zoneId, "example");
            }
        },
        error: function () {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'error',
                title: 'Failed to update phishlet subdomain',
                showConfirmButton: false,
                timer: 3000
            });
        }
    });
}

// Update the tracking lure URL display with new domain (without creating new lure)
function updateTrackingLureUrlDisplay(newDomain) {
    // Get current URLs and redirector status
    var currentDisplayUrl = $("#trackingLureUrl").val();
    var currentActualUrl = $("#actualLureUrl").val() || $("#manualLureUrl").val();
    var useRedirector = $("#useRedirector").is(":checked");
    var redirectorDomain = $("#redirectorDomain").val();

    // 1. Always update the Actual Lure URL (the backend evilginx URL)
    // 1. Always update the Actual Lure URL (the backend evilginx URL)
    // Extract path and query from actual URL or display URL
    var path = "";
    var query = "";
    if (currentActualUrl) {
        try {
            var urlObj = new URL(currentActualUrl);
            path = urlObj.pathname;
            query = urlObj.search;
        } catch (e) {
            var parts = currentActualUrl.split('?');
            var urlPart = parts[0];
            query = parts.length > 1 ? "?" + parts[1] : "";

            var pathParts = urlPart.split('/');
            path = pathParts.length > 3 ? "/" + pathParts.slice(3).join('/') : '';
        }
    } else if (currentDisplayUrl) {
        try {
            var urlObj = new URL(currentDisplayUrl);
            path = urlObj.pathname;
            query = urlObj.search;
        } catch (e) {
            var parts = currentDisplayUrl.split('?');
            var urlPart = parts[0];
            query = parts.length > 1 ? "?" + parts[1] : "";

            var pathParts = urlPart.split('/');
            path = pathParts.length > 3 ? "/" + pathParts.slice(3).join('/') : '';
        }
    }

    // Ensure path starts with /
    if (path && !path.startsWith('/')) path = "/" + path;

    var newActualUrl = "https://" + newDomain + path + query;
    $("#actualLureUrl").val(newActualUrl);

    // 2. Always update the Tracking Lure URL display with the actual lure URL
    // User wants to always see the lure_url, not the redirector URL
    $("#trackingLureUrl").val(newActualUrl);

    // Update manualLureUrl based on redirector state (for campaign submission)
    if (!useRedirector || !redirectorDomain) {
        $("#manualLureUrl").val(newActualUrl);
    }
    // If redirector is enabled, manualLureUrl keeps the redirector URL

    // 3. Update QR Code Preview
    if ($("#campaign_type").val() === "qr") {
        // Use manualLureUrl which correctly holds either redirector or actual lure URL
        generateQR($("#manualLureUrl").val());
    }
}
// Copy tracking lure URL to clipboard
function copyTrackingLureUrl() {
    var lureUrl = $("#trackingLureUrl").val();
    if (lureUrl) {
        navigator.clipboard.writeText(lureUrl).then(function () {
            Swal.fire({
                toast: true,
                position: 'top-end',
                icon: 'success',
                title: 'Tracking URL copied!',
                showConfirmButton: false,
                timer: 2000
            });
        });
    }
}

function launch() {
    Swal.fire({
        title: "Are you sure?",
        text: "This will schedule the campaign to be launched.",
        type: "question",
        animation: false,
        showCancelButton: true,
        confirmButtonText: "Launch",
        confirmButtonColor: "#428bca",
        reverseButtons: true,
        allowOutsideClick: false,
        showLoaderOnConfirm: true,
        preConfirm: function () {
            return new Promise(function (resolve, reject) {
                var selectedGroups = [];
                var groupNames = $("#users").val() || [];
                groupNames.forEach(function (name) {
                    selectedGroups.push({ name: name });
                });

                var send_by_date = $("#send_by_date").val();
                if (send_by_date != "") {
                    send_by_date = moment(send_by_date, "MMMM Do YYYY, h:mm a").utc().format();
                }

                var scheduled_stop_date = $("#scheduled_stop_date").val();
                if (scheduled_stop_date != "") {
                    scheduled_stop_date = moment(scheduled_stop_date, "MMMM Do YYYY, h:mm a").utc().format();
                }

                var redirectorEnabled = $("#useRedirector").is(":checked");
                var redirectorDomain = $("#redirectorDomain").val() || "";
                var finalDesintation = $("#selectedLureLandingUrl").val() || "";
                var lureUrl = $("#manualLureUrl").val() || "";

                // Build landing_url with full path (same structure as url but without tracker)
                var landingUrl = "";
                if (redirectorEnabled && redirectorDomain && lureUrl) {
                    // Extract path from lure URL and append to redirector domain
                    var urlPath = "";
                    try {
                        var urlObj = new URL(lureUrl);
                        urlPath = urlObj.pathname;
                    } catch (e) {
                        // Fallback: extract path manually
                        var pathMatch = lureUrl.match(/https?:\/\/[^\/]+(\/.*)/);
                        urlPath = pathMatch ? pathMatch[1] : "";
                    }
                    landingUrl = "https://" + redirectorDomain + urlPath;
                }

                var campaign = {
                    name: $("#name").val(),
                    template: { name: $("#template_name").val() },
                    // url is the actual lure URL for tracking (not the redirector URL)
                    url: $("#actualLureUrl").val() || $("#manualLureUrl").val(),
                    page: { name: "" },
                    launch_date: moment($("#launch_date").val(), "MMMM Do YYYY, h:mm a").utc().format(),
                    send_by_date: send_by_date || null,
                    scheduled_stop_date: scheduled_stop_date || null,
                    groups: selectedGroups,
                    campaign_type: $("#campaign_type").val(),
                    attack_objective: $("#attack_objective").val(),

                    // Correct Mapping as requested:
                    // Final Destination (Step 5) -> redirect_url (Exit URL)
                    redirect_url: finalDesintation,

                    // landing_url includes full path from lure URL
                    landing_url: landingUrl,

                    use_redirector: redirectorEnabled,
                    redirector_domain: redirectorDomain,
                    redirector_template: $("#redirectorTemplate").val(),
                    phishlet: $("#phishletSelect").val()
                };

                if (campaign.campaign_type == "email" || campaign.campaign_type == "qr") {
                    campaign.smtp = { name: $("#profile_name").val() || "" };
                } else {
                    campaign.sms = { name: $("#profile_name").val() || "" };
                }

                if (campaign.campaign_type == "qr") {
                    campaign.qr_size = parseInt($("#qr_size").val()) || 250;
                }

                var p;
                if (campaign.campaign_type == "email" || campaign.campaign_type == "qr" || !campaign.campaign_type) {
                    p = api.campaigns.post(campaign);
                } else {
                    p = api.sms_campaigns.post(campaign);
                }

                p.done(function (data) {
                    resolve();
                }).fail(function (data) {
                    var message = "An error occurred";
                    if (data.responseJSON && data.responseJSON.message) {
                        message = data.responseJSON.message;
                    } else if (data.responseText) {
                        message = data.responseText;
                    }
                    Swal.showValidationMessage(message);
                    resolve(false);
                });
            });
        }
    }).then(function (result) {
        if (result.value) {
            Swal.fire('Campaign Scheduled!', 'This campaign has been scheduled for launch!', 'success')
                .then(function () {
                    location.href = "/campaigns";
                });
        }
    });
}

function sendTestEmail() {
    var type = $("#campaign_type").val()
    var test_request = {
        template: {
            name: $("#template_name").val()
        },
        first_name: $("input[name=to_first_name]").val(),
        last_name: $("input[name=to_last_name]").val(),
        email: $("input[name=to_email]").val(),
        position: $("input[name=to_position]").val(),
        url: $("#lureList").val(),
        page: {
            name: ""
        }
    }
    if (type == "email" || type == "qr") {
        test_request.smtp = {
            name: $("#profile_name").val() || ""
        }
        if (type == "qr") {
            test_request.qr_size = parseInt($("#qr_size").val()) || 250
        }
    } else {
        test_request.sms = {
            name: $("#profile_name").val() || ""
        }
    }
    var btnHtml = $("#sendTestModalSubmit").html()
    $("#sendTestModalSubmit").html('<i class="fa fa-spinner fa-spin"></i> Sending')

    var p = (type == "email" || type == "qr") ? api.send_test_email(test_request) : api.send_test_sms(test_request)
    p.done(function (data) {
        var msg = (type == "email" || type == "qr") ? "Email Sent!" : "SMS Sent!"
        $("#sendTestEmailModal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-success\">\
            <i class=\"fa fa-check-circle\"></i> " + msg + "</div>")
        $("#sendTestModalSubmit").html(btnHtml)
    })
        .fail(function (data) {
            var message = "An error occurred"
            if (data.responseJSON && data.responseJSON.message) {
                message = data.responseJSON.message
            } else if (data.responseText) {
                message = data.responseText
            }
            $("#sendTestEmailModal\\.flashes").empty().append("<div style=\"text-align:center\" class=\"alert alert-danger\">\
            <i class=\"fa fa-exclamation-circle\"></i> " + message + "</div>")
            $("#sendTestModalSubmit").html(btnHtml)
        })
}

var pendingCampaignData = null;

function populateCampaignData(campaign) {
    if (!cachedModalData) {
        pendingCampaignData = campaign; // Defer population until options are loaded
        return;
    }

    $("#name").val(campaignId ? campaign.name : "Copy of " + campaign.name);

    // Set type first to trigger field visibility
    if (campaign.campaign_type) {
        $("#campaign_type").val(campaign.campaign_type).change();
    } else {
        $("#campaign_type").val("email").change();
        // Force trigger to set label-success
    }

    // Set Attack Objective
    if (campaign.attack_objective) {
        $("#attack_objective").val(campaign.attack_objective).change()
    }

    $("#lureList").val(campaign.url);
    $("#tracking_redirect_url").val(campaign.redirect_url);
    if (campaign.qr_size) $("#qr_size").val(campaign.qr_size);

    // Select2s need special handling to check if options exist
    if (campaign.template && campaign.template.name) {
        // Find ID by name if possible, or just select by text if ID match fails
        // But select2 is initialized with IDs from backend.
        // The campaign object from API usually has objects.
        if (campaign.template.id) {
            $("#template").val(campaign.template.id.toString()).trigger("change");
        }
    }

    if (campaign.smtp && campaign.smtp.id) {
        $("#profile").val(campaign.smtp.id.toString()).trigger("change");
    } else if (campaign.sms && campaign.sms.id) {
        $("#profile").val(campaign.sms.id.toString()).trigger("change");
    }

    // Groups
    if (campaign.groups) {
        var groupIds = campaign.groups.map(function (g) { return g.id.toString(); });
        $("#users").val(groupIds).trigger("change");
    }

    if (campaign.scheduled_stop_date && campaign.scheduled_stop_date != "0001-01-01T00:00:00Z") {
        $("#scheduled_stop_date").data("DateTimePicker").date(moment(campaign.scheduled_stop_date));
    }
}

// Main Initialization Block (Consolidated)
$(document).ready(function () {
    // Select2 Defaults
    $.fn.select2.defaults.set("width", "100%");
    $.fn.select2.defaults.set("theme", "bootstrap");

    // Initialize Select2 ONLY on valid SELECT elements
    $("#campaign_type").select2();
    $("#attack_objective").select2();
    $("#phishletHostname").select2({
        placeholder: "-- Select Domain --",
        allowClear: true
    });
    $("#redirectorDomain").select2();
    $("#users").select2();


    $("#campaign_type").change(function () {
        var type = $(this).val()
        $(".qr-only").hide()

        // Update Header Label
        var labelText = "Email";
        if (type == "sms") labelText = "SMS";
        if (type == "qr") labelText = "QR";
        $("#header_campaign_type").text(labelText);

        // Update Step 2 title based on campaign type
        var step2Title = "Email Template";
        if (type == "sms") step2Title = "SMS Template";
        if (type == "qr") step2Title = "QR Template";
        $("#step2_title").text(step2Title);

        if (type == "email") {
            $("#template_label").text("Email Template:")
            $("#profile_label").text("Sending Profile:")
            $("#delay_label").html('Send Emails By (Optional) <i class="fa fa-question-circle" data-toggle="tooltip" data-placement="right" title="If specified, trust_strike will send emails evenly between the campaign launch and this date."></i>')
            $("#testButtonIcon").attr('class', 'fa fa-envelope')
            $("#testButtonText").text('Send Test Email')
        } else if (type == "sms") {
            $("#template_label").text("SMS Template:")
            $("#profile_label").text("SMS Profile:")
            $("#delay_label").html('Send SMS By (Optional) <i class="fa fa-question-circle" data-toggle="tooltip" data-placement="right" title="If specified, trust_strike will send SMS evenly between the campaign launch and this date."></i>')
            $("#testButtonIcon").attr('class', 'fa fa-commenting')
            $("#testButtonText").text('Send Test SMS')
        } else if (type == "qr") {
            $("#template_label").text("QR Template:")
            $("#profile_label").text("Sending Profile:")
            $("#delay_label").html('Send QR By (Optional) <i class="fa fa-question-circle" data-toggle="tooltip" data-placement="right" title="If specified, trust_strike will send QR evenly between the campaign launch and this date."></i>')
            $("#testButtonIcon").attr('class', 'fa fa-envelope')
            $("#testButtonText").text('Send Test QR')
            $(".qr-only").show()
            generateQR($("#manualLureUrl").val())
        }
        $('[data-toggle="tooltip"]').tooltip()

        // Auto-filter groups based on campaign type
        // Hide manual filter controls as it depends on campaign type now
        $(".btn-filter-group").parent().hide();

        if (window.filterGroups) {
            var groupType = type;
            if (type == "qr" || type == "email") groupType = "email";

            if (window.filterGroups) {
                window.filterGroups(groupType);
            }
        }

        setupOptions()

        // Update Step 3 labels based on campaign type
        var mediumName = "Email";
        if (type == "sms") mediumName = "SMS";
        $("#redirectorDomainLabel").html('<i class="fa fa-link"></i> <span>Domain in ' + mediumName + '</span>');
        $("#emailUrlPreviewLabelText").text("URL in " + mediumName);

        // Update Step 5 labels based on campaign type
        updateTrackingDomainLabel();

        // Update flow diagram with new campaign type
        var currentStep = parseInt($(".step-wizard-item.current-item").data("step")) || 1;
        updateVisualFlow(currentStep);
    })

    // Import Email Function
    window.importEmail = function () {
        var raw = $("#email_content").val();
        var convert_links = $("#convert_links_checkbox").prop("checked");
        if (!raw) {
            $("#importModal\\.flashes").empty().append("<div class='alert alert-danger'>No Content Specified!</div>");
        } else {
            api.import_email({
                content: raw,
                convert_links: convert_links
            })
                .done(function (data) {
                    $("#modal_text_editor").val(data.text);
                    $("#modal_html_editor").val(data.html); // Fallback
                    if (CKEDITOR.instances["modal_html_editor"]) {
                        CKEDITOR.instances["modal_html_editor"].setData(data.html);
                    }
                    $("#modal_subject").val(data.subject);

                    // Switch to HTML tab
                    if (data.html) {
                        $('.nav-tabs a[href="#modal_html"]').tab('show');
                    }
                    $("#importEmailModal").modal("hide");
                })
                .fail(function (data) {
                    var message = "An error occurred";
                    if (data.responseJSON && data.responseJSON.message) {
                        message = data.responseJSON.message;
                    }
                    $("#importModal\\.flashes").empty().append("<div class='alert alert-danger'>" + message + "</div>");
                });
        }
    };

    // Fix for nested modal scrolling issue
    $('#importEmailModal').on('hidden.bs.modal', function () {
        if ($('#createTemplateModal').hasClass('in')) {
            $('body').addClass('modal-open');
            $('#createTemplateModal').css('overflow-y', 'auto');
        }
    });

    // Helper to update UI based on type
    window.updateTemplateModalUI = function (type) {
        $("#modal_template_type").val(type); // Ensure hidden is set

        var typeLabel = "Email Template";
        if (type == "sms") typeLabel = "SMS Template";
        if (type == "qr") typeLabel = "QR Template";
        $("#modal_visual_template_type").val(typeLabel);

        if (type == "sms") {
            $(".modal-email-only").hide();
            $(".modal-sms-only").show();
            $('.nav-tabs a[href="#modal_sms"]').tab('show');
        } else {
            $(".modal-email-only").show();
            $(".modal-sms-only").hide(); // Fixed: Ensure SMS tab is valid
            // Check if we are in QR setup, maybe similar to email?
            // For now, treat QR and Email similarly regarding modal fields (except specific ones hidden by class)
            // But modal-sms-only should be hidden.

            $('.nav-tabs a[href="#modal_html"]').tab('show');
        }
    };

    // QR Code listeners
    $("#lureList").on("input", function () {
        if ($("#campaign_type").val() == "qr") {
            generateQR($(this).val());
        }
    });
    $("#qr_size").on("keyup change", function () {
        if ($("#campaign_type").val() == "qr") {
            var url = $("#trackingLureUrl").val() || $("#manualLureUrl").val();
            generateQR(url);
        }
    });

    // Also update QR if the URL field changes manually or programmatically
    $("#trackingLureUrl").on("change input", function () {
        if ($("#campaign_type").val() == "qr") {
            generateQR($(this).val());
        }
    });

    // Datepickers
    $("#launch_date").datetimepicker({
        "widgetPositioning": {
            "vertical": "bottom"
        },
        "showTodayButton": true,
        "defaultDate": moment(),
        "format": "MMMM Do YYYY, h:mm a"
    })

    $("#scheduled_stop_date").datetimepicker({
        "widgetPositioning": {
            "vertical": "bottom"
        },
        "showTodayButton": true,
        "defaultDate": moment(),
        "format": "MMMM Do YYYY, h:mm a"
    })

    $("#send_by_date").datetimepicker({
        "widgetPositioning": {
            "vertical": "bottom"
        },
        "showTodayButton": true,
        "useCurrent": false,
        "format": "MMMM Do YYYY, h:mm a"
    })
    $("#scheduled_stop_date").datetimepicker({
        "widgetPositioning": {
            "vertical": "bottom"
        },
        "showTodayButton": true,
        "useCurrent": false, // Important to not auto-fill on open if tracking date changes
        "format": "MMMM Do YYYY, h:mm a"
    })

    // Attack Objective change
    $(document).on("change", "#attack_objective", function () {
        var objective = $(this).val();
        if (objective == "Tracking only") {
            $("#url").parent().show();
            $("#tracking_redirect_url_group").show();

            // Flow Diagram Update: Handled by updateVisualFlow()

            // Set flag to skip Step 4
            window.skipPhishletStep = true;

            // Auto-select and enable the "example" phishlet
            autoSelectExamplePhishlet();

            // Step 5: Show tracking domain section, hide current lure URL
            $("#trackingDomainSection").show();
            if ($("#campaign_type").val() === "qr") {
                $(".qr-only").show();
            }
            $("#currentLureSection").hide();

            // Hide Final Destination section in Tracking Only mode
            // $("#finalDestinationSection").hide();
            // $("#btnSaveFinalDestination").hide();

            // Update Step 5 label based on redirector state
            updateTrackingDomainLabel();

            // Populate tracking domain dropdown with Cloudflare domains
            populateTrackingDomains();

        } else {
            $("#url").parent().show();
            $("#tracking_redirect_url_group").hide();

            // Flow Diagram Update: Handled by updateVisualFlow()

            // Reset flag - show Step 4
            window.skipPhishletStep = false;

            // Step 5: Hide tracking domain section, show current lure URL
            $("#trackingDomainSection").hide();
            $("#currentLureSection").show();

            // Show Final Destination section in Session Hijacking mode
            $("#finalDestinationSection").show();
            $("#btnSaveFinalDestination").show();
        }

        // Update flow diagram to reflect the new attack objective
        var currentStep = parseInt($(".step-wizard-item.current-item").data("step")) || 1;
        updateVisualFlow(currentStep);
    });

    // Function to update Step 5 Tracking Domain label based on redirector state and campaign type
    function updateTrackingDomainLabel() {
        var useRedirector = $("#useRedirector").is(":checked");
        var campaignType = $("#campaign_type").val() || "email";

        // Determine the medium name based on campaign type
        var mediumName = "Email";
        if (campaignType === "sms") mediumName = "SMS";
        if (campaignType === "qr") mediumName = "QR";

        if (useRedirector) {
            // Redirector ON: Step 5 label = "Domain in Redirector Page"
            $("#trackingDomainLabel").text("Domain in Redirector Page");
            // Update Tracking Lure URL label
            $("#trackingLureUrlLabelText").text("URL in Redirector Page");
        } else {
            // Redirector OFF: Step 5 label = "Domain in [Email/SMS/QR]"
            $("#trackingDomainLabel").text("Domain in " + mediumName);
            // Update Tracking Lure URL label
            $("#trackingLureUrlLabelText").text("URL in " + mediumName);
        }
    }

    // Update Step 5 label when redirector checkbox changes
    $(document).on("change", "#useRedirector", function () {
        var isTrackingOnly = $("#attack_objective").val() === "Tracking only";
        if (isTrackingOnly) {
            updateTrackingDomainLabel();
        }
    });

    // Auto-select and enable the "example" phishlet for Tracking only mode
    function autoSelectExamplePhishlet() {
        // Set the phishlet select to "example"
        var $phishletSelect = $("#phishletSelect");

        // Check if "example" option exists, if so select it
        if ($phishletSelect.find("option[value='example']").length > 0) {
            $phishletSelect.val("example").trigger("change");
        } else {
            // Add it if not present and select
            $phishletSelect.append($("<option>").val("example").text("example"));
            $phishletSelect.val("example").trigger("change");
        }

        // Set a default hostname for example phishlet (using the config domain if available)
        // The hostname will be set when domains are loaded
        setTimeout(function () {
            // Enable the example phishlet on the server
            $.post("/api/simulationserver/modules/example/toggle", function (response) {
                if (response.success) {
                }
            });
        }, 500);
    }

    // Initial load
    var urlParams = new URLSearchParams(window.location.search);
    var copyId = urlParams.get('copy');

    if (campaignId) {
        $("#campaignTitle").text("Edit Campaign");
        // Logic to load campaign if editing
        api.campaignId.get(campaignId).done(function (c) {
            $("#campaignTitle").text("Edit Campaign: " + c.name);
            populateCampaignData(c);
        });
    } else if (copyId) {
        $("#campaignTitle").text("New Campaign (Copy)");
        api.campaignId.get(copyId).done(function (c) {
            populateCampaignData(c);
        });
    } else {
        // New campaign defaults
    }

    setupOptions();

    // Load data for wizard steps
    loadCloudflaireDomains();
    loadRedirectorTemplates();
    loadPhishlets();

    // Bind checkbox toggle event
    $("#useRedirector").on("change", function () {
        toggleRedirectorOptions();
    });

    // Initial state set
    toggleRedirectorOptions();

    // Trigger initial changes to set correct UI state (Tracking Only/Session Hijacking etc)
    // Note: This must happen AFTER all listeners are bound
    setTimeout(function () {
        $("#attack_objective").trigger("change");
        $("#campaign_type").trigger("change");
        updateVisualFlow(currentStep);
    }, 100);
});

// --- Template Creation From Modal Logic ---

$(document).ready(function () {
    // Initialize CKEditor when modal is shown
    $('#createTemplateModal').on('shown.bs.modal', function () {
        if (!CKEDITOR.instances["modal_html_editor"]) {
            $("#modal_html_editor").ckeditor();
            // Setup Autocomplete if needed
            if (typeof setupAutocomplete === 'function') {
                setupAutocomplete(CKEDITOR.instances["modal_html_editor"]);
            }
        }
        $("#modal_template_name").focus();

        // Sync type with campaign type
        var currentCampaignType = $("#campaign_type").val();
        $("#modal_template_type").val(currentCampaignType).trigger('change');
    });

    $("#modal_template_type").change(function () {
        var type = $(this).val();
        if (type == "sms") {
            $(".modal-email-only").hide();
            $(".modal-sms-only").show();
            $('#createTemplateModal .nav-tabs li').removeClass('active');
            $('#createTemplateModal .tab-pane').removeClass('active');
            $('#createTemplateModal .nav-tabs li[role="sms"]').addClass('active').show();
            $('#modal_sms').addClass('active');
        } else {
            $(".modal-email-only").show();
            $(".modal-sms-only").hide();
            $('#createTemplateModal .nav-tabs li').removeClass('active');
            $('#createTemplateModal .tab-pane').removeClass('active');
            $('#createTemplateModal .nav-tabs li[role="html"]').addClass('active');
            $('#modal_html').addClass('active');
        }
    });

    $("#modal_saveTemplateSubmit").click(function () {

        var editingId = window.currentEditingTemplateId;

        var templateData = {
            name: $("#modal_template_name").val(),
            type: $("#modal_template_type").val(),
            attachments: []
        };

        if (editingId) {
            templateData.id = parseInt(editingId);
        }

        if (templateData.name == "") {
            errorFlash("Template name is required");
            return;
        }

        if (templateData.type == "sms") {
            templateData.text = $("#modal_sms_editor").val();
            templateData.html = "";
            templateData.subject = "";
        } else {
            templateData.subject = $("#modal_subject").val();
            templateData.envelope_sender = $("#modal_envelope_sender").val();
            templateData.html = CKEDITOR.instances["modal_html_editor"].getData();
            templateData.html = templateData.html.replace(/https?:\/\/{{\.URL}}/gi, "{{.URL}}");
            templateData.text = $("#modal_text_editor").val();
        }

        var btn = $(this);
        var originalHtml = btn.html();
        btn.html('<i class="fa fa-spinner fa-spin"></i> Saving...').prop('disabled', true);

        // Check if editing
        // var editingId = ... (fetched above)
        var p;
        if (editingId) {

            p = api.templateId.put(templateData);
        } else {
            p = api.templates.post(templateData);
        }

        p.done(function (newTemplate) {
            // Success!
            btn.html(originalHtml).prop('disabled', false);
            window.currentEditingTemplateId = null; // Clear ID
            $("#createTemplateModal").modal("hide");

            // Clear modal fields for next time
            $("#modal_template_name").val("");
            $("#modal_subject").val("");
            $("#modal_envelope_sender").val("");
            if (CKEDITOR.instances["modal_html_editor"]) {
                CKEDITOR.instances["modal_html_editor"].setData("");
            }
            $("#modal_text_editor").val("");
            $("#modal_sms_editor").val("");

            // Refresh options and select the new/updated template
            // We reload everything to be safe and update grid
            $.when(api.templates.get()).done(function (templates) {
                if (cachedModalData) {
                    cachedModalData.templates = templates;
                    renderOptions(cachedModalData);

                    if (newTemplate && newTemplate.id) {
                        // If we just edited current selection, it stays selected (ID same)
                        // If we created new, we select it.
                        selectTemplateCard(newTemplate.id);
                    }
                    if (editingId) {
                        successFlash("Template updated!");
                        selectTemplateCard(editingId);
                    } else {
                        successFlash("Template created!");
                        if (newTemplate && newTemplate.id) selectTemplateCard(newTemplate.id);
                    }
                }
            });
        })
            .fail(function (xhr) {
                console.error("Template save failed:", xhr);
                btn.html(originalHtml).prop('disabled', false);
                var message = "Failed to save template";
                if (xhr.responseJSON && xhr.responseJSON.message) {
                    message = xhr.responseJSON.message;
                } else {
                    message += " (" + xhr.status + ": " + xhr.statusText + ")";
                }
                $("#templateModal\\.flashes").empty().append("<div class='alert alert-danger'>" + message + "</div>");
            });
    });

    // --- New Group Creation Modal Logic ---
    var modalTargetsTable = $("#modal_targetsTable").DataTable({
        destroy: true,
        columnDefs: [{
            orderable: false,
            targets: "no-sort"
        }]
    });

    $('#createGroupModal').on('shown.bs.modal', function () {
        window.currentEditingGroupId = null;
        $("#createGroupModalLabel").text("New Group");
        $("#modal_group_name").focus();
        // Match group type to campaign type
        $("#modal_group_type").val($("#campaign_type").val());
    });

    $('#createGroupModal').on('hidden.bs.modal', function () {
        // Clear flashes and fields
        $("#modal_group_flashes").empty();
        $("#modal_group_name").val("");
        $("#modal_targetForm .form-control").val("");
        modalTargetsTable.clear().draw();
        $("#modal_saveGroupSubmit").removeData("bulk-token");
        // Reset file input
        $("#modal_csvupload").val("");
    });

    // Handle manual additions in modal
    $("#modal_targetForm").submit(function (e) {
        e.preventDefault();
        var targetForm = document.getElementById("modal_targetForm");
        if (!targetForm.checkValidity()) {
            targetForm.reportValidity();
            return;
        }

        var firstName = $("#modal_firstName").val();
        var lastName = $("#modal_lastName").val();
        var email = $("#modal_email").val().toLowerCase();
        var position = $("#modal_position").val();

        var newRow = [
            escapeHtml(firstName),
            escapeHtml(lastName),
            escapeHtml(email),
            escapeHtml(position),
            '<span style="cursor:pointer;" class="modal_delete_target"><i class="fa fa-trash-o"></i></span>'
        ];

        // Check for duplicate email
        var existingRowIndex = modalTargetsTable
            .column(2, {
                order: "index"
            })
            .data()
            .indexOf(email);

        if (existingRowIndex >= 0) {
            modalTargetsTable.row(existingRowIndex, {
                order: "index"
            }).data(newRow);
        } else {
            modalTargetsTable.row.add(newRow);
        }
        modalTargetsTable.draw();

        // Reset inputs
        $("#modal_targetForm .form-control").val('');
        $("#modal_firstName").focus();
    });

    // Handle deletion in modal targets table
    $("#modal_targetsTable").on("click", ".modal_delete_target", function () {
        modalTargetsTable.row($(this).parents('tr')).remove().draw();
    });

    // Bulk Import for modal
    $("#modal_csvupload").fileupload({
        url: "/api/import/group/bulk",
        dataType: "json",
        paramName: 'file',
        add: function (e, data) {
            $("#modal_group_flashes").empty();
            var acceptFileTypes = /(csv|txt)$/i;
            var filename = data.originalFiles[0]['name'];
            if (filename && !acceptFileTypes.test(filename.split(".").pop())) {
                errorFlashModal("Unsupported file extension (use .csv or .txt)", "#modal_group_flashes");
                return false;
            }
            $("#modal_saveGroupSubmit").removeData("bulk-token");
            data.submit();
        },
        done: function (e, data) {
            if (data.result.success && data.result.file_token) {
                $("#modal_saveGroupSubmit").data("bulk-token", data.result.file_token);
                modalTargetsTable.clear().draw();
                if (data.result.preview && data.result.preview.length > 0) {
                    $.each(data.result.preview, function (i, record) {
                        modalTargetsTable.row.add([
                            escapeHtml(record.first_name || ""),
                            escapeHtml(record.last_name || ""),
                            escapeHtml(record.email || ""),
                            escapeHtml(record.position || ""),
                            '<span style="cursor:pointer;" class="modal_delete_target"><i class="fa fa-trash-o"></i></span>'
                        ]);
                    });
                    modalTargetsTable.draw();
                }
                Swal.fire({
                    title: 'Preview Loaded',
                    text: 'Showing first ' + data.result.preview.length + ' of ' + data.result.total_count + ' records. Click "Save Group" to finalize.',
                    type: 'info'
                });
            } else {
                errorFlashModal(data.result.message || "Unknown error during upload", "#modal_group_flashes");
            }
        },
        fail: function (e, data) {
            errorFlashModal("Upload failed: " + (data.responseJSON ? data.responseJSON.message : "Server error"), "#modal_group_flashes");
        }
    });

    // Download template logic
    $("#modal_csv-template").click(function () {
        var csvScope = [{
            'First Name': 'Example',
            'Last Name': 'User',
            'Email': 'foobar@example.com',
            'Position': 'Systems Administrator'
        }];
        var filename = 'group_template.csv';
        var csvString = Papa.unparse(csvScope, {});
        var csvData = new Blob([csvString], {
            type: 'text/csv;charset=utf-8;'
        });
        var csvURL = window.URL.createObjectURL(csvData);
        var dlLink = document.createElement('a');
        dlLink.href = csvURL;
        dlLink.setAttribute('download', filename);
        document.body.appendChild(dlLink);
        dlLink.click();
        document.body.removeChild(dlLink);
    });

    // Save Group Logic
    $("#modal_saveGroupSubmit").click(function () {
        var bulkFileToken = $(this).data("bulk-token");
        var groupName = $("#modal_group_name").val();
        if (!groupName) {
            errorFlashModal("Group name is required", "#modal_group_flashes");
            return;
        }

        var groupData = {
            name: groupName,
            group_type: $("#modal_group_type").val()
        };

        var btn = $(this);
        var oldHtml = btn.html();
        btn.html('<i class="fa fa-spinner fa-spin"></i> Saving...').prop('disabled', true);

        if (bulkFileToken) {
            groupData.file_token = bulkFileToken;
            api.groups.bulk_import_confirm(groupData)
                .done(handleGroupSaveSuccess)
                .fail(handleGroupSaveError);
        } else {
            var targets = [];
            $.each(modalTargetsTable.rows().data(), function (i, row) {
                targets.push({
                    first_name: unescapeHtml(row[0]),
                    last_name: unescapeHtml(row[1]),
                    email: unescapeHtml(row[2]),
                    position: unescapeHtml(row[3])
                });
            });
            groupData.targets = targets;

            var editingId = window.currentEditingGroupId;
            var p;
            if (editingId) {
                groupData.id = parseInt(editingId);
                p = api.groupId.put(groupData);
            } else {
                p = api.groups.post(groupData);
            }

            p.done(handleGroupSaveSuccess)
                .fail(handleGroupSaveError);
        }

        function handleGroupSaveSuccess(data) {
            btn.html(oldHtml).prop('disabled', false);
            // Refresh groups select
            api.groups.summary()
                .done(function (summaries) {
                    if (cachedModalData) {
                        cachedModalData.groups = summaries.groups;

                        var select = $("#users");
                        var currentValues = select.val() || [];

                        // Add the new group ID to current values
                        var newGroupId = (data.group_id || data.id || "").toString();
                        if (newGroupId && currentValues.indexOf(newGroupId) === -1) {
                            currentValues.push(newGroupId);
                        }

                        renderOptions(cachedModalData);
                        select.val(currentValues).trigger('change');

                        // Also update the group table
                        window.renderGroupTable(cachedModalData.groups);
                    }

                    $("#createGroupModal").modal("hide");
                    successFlash(data.id ? "Group updated!" : "Group created and selected!");
                });
        }

        function handleGroupSaveError(xhr) {
            btn.html(oldHtml).prop('disabled', false);
            var msg = (xhr.responseJSON && xhr.responseJSON.message) ? xhr.responseJSON.message : "Error saving group";
            errorFlashModal(msg, "#modal_group_flashes");
        }
    });

    function errorFlashModal(msg, selector) {
        $(selector).empty().append("<div style='text-align:center' class='alert alert-danger'><i class='fa fa-exclamation-circle'></i> " + msg + "</div>");
    }

    // Edit Group Function (attached to window to be accessible from table render)
    window.editGroup = function (id) {
        window.currentEditingGroupId = id;
        $("#createGroupModalLabel").text("Edit Group");

        // Fetch full group details
        api.groupId.get(id).done(function (g) {
            $("#modal_group_name").val(g.name);
            $("#modal_group_type").val(g.group_type || 'email');

            var table = $("#modal_targetsTable").DataTable();
            table.clear();

            if (g.targets) {
                $.each(g.targets, function (i, t) {
                    var newRow = [
                        escapeHtml(t.first_name || ""),
                        escapeHtml(t.last_name || ""),
                        escapeHtml(t.email || ""),
                        escapeHtml(t.position || ""),
                        '<span style="cursor:pointer;" class="modal_delete_target"><i class="fa fa-trash-o"></i></span>'
                    ];
                    table.row.add(newRow);
                });
            }
            table.draw();

            $("#createGroupModal").modal("show");
        }).fail(function () {
            errorFlash("Failed to fetch group details.");
        });
    };

    function errorFlashModal(msg, selector) {
        $(selector).empty().append("<div style='text-align:center' class='alert alert-danger'><i class='fa fa-exclamation-circle'></i> " + msg + "</div>");
    }
});

var currentModules = [];

// Fetch modules when setting up options
function loadModules() {
    $.get('/api/simulationserver/modules', function (data) {
        currentModules = data || [];
    });
}

/* --- Lure Selection Logic --- */
var lureCurrentPage = 1;
var lureItemsPerPage = 6;
var currentLures = [];

window.renderLureTable = function (strikes) {
    if (strikes) currentLures = strikes;
    else strikes = currentLures;

    var filter = $("#lureSearch").val() ? $("#lureSearch").val().toLowerCase() : "";
    var filtered = strikes.filter(function (s) {
        if (!filter) return true;
        return (s.url && s.url.toLowerCase().indexOf(filter) > -1) ||
            (s.redirect_url && s.redirect_url.toLowerCase().indexOf(filter) > -1);
    });

    // Ensure we have modules loaded for later use
    if (currentModules.length === 0) loadModules();

    var tbody = $("#lureTableBody");
    tbody.empty();

    if (!filtered || filtered.length === 0) {
        tbody.append('<tr><td colspan="4" class="text-center">No lures found matching criteria.</td></tr>');
        $("#lurePagination").hide();
        return;
    }

    var totalPages = Math.ceil(filtered.length / lureItemsPerPage);
    if (lureCurrentPage > totalPages) lureCurrentPage = 1;
    if (lureCurrentPage < 1) lureCurrentPage = 1;

    var start = (lureCurrentPage - 1) * lureItemsPerPage;
    var end = start + lureItemsPerPage;
    var pageItems = filtered.slice(start, end);

    $.each(pageItems, function (i, s) {
        var url = s.url;
        var redirectUrl = s.redirect_url || "";
        var redirectDisplay = redirectUrl || "None";
        var id = s.id;

        var tr = $("<tr>");
        tr.attr("id", "lure-row-" + id);
        tr.css("cursor", "pointer");

        // Checkbox column
        var isSelected = ($("#selectedLureId").val() == id);
        if (isSelected) tr.addClass("success");

        // Only use landing_url if there's a redirector (otherwise it's "None")
        var landingUrl = (s.redirector && s.landing_url) ? s.landing_url : "";
        tr.click(function (e) {
            // Don't trigger if clicked on a button
            if ($(e.target).closest('button').length || $(e.target).closest('a').length) return;

            // Auto-update Redirector if selected
            if (typeof selectedRedirectorTemplate !== 'undefined' && selectedRedirectorTemplate) {
                $.ajax({
                    url: '/api/simulationserver/strikes/' + id + '/edit',
                    method: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({
                        redirector: selectedRedirectorTemplate
                    }),
                    success: function () {

                        const Toast = Swal.mixin({
                            toast: true,
                            position: 'top-end',
                            showConfirmButton: false,
                            timer: 3000
                        });
                        Toast.fire({
                            icon: 'success',
                            title: 'Redirector updated to ' + selectedRedirectorTemplate
                        });

                        // Fetch updated strikes to refresh the UI live
                        getStrikes().then(function (data) {
                            if (data.success) {
                                cachedModalData.strikes = data.data;
                                renderLureTable(data.data);
                            }
                        });
                    },
                    error: function () {
                        console.error("Failed to update lure " + id + " redirector");
                    }
                });
            }

            window.selectLure(url, redirectUrl, landingUrl, $(this), id);
        });

        var checkIcon = isSelected ? "fa-check-circle-o" : "fa-circle-o";
        tr.append($("<td class='text-center'>").html(`<i class="fa ${checkIcon} lure-check"></i>`));

        // URL Column with Copy Button
        var urlCell = $("<td>");
        urlCell.append($(`<span style="margin-right: 10px;">${escapeHtml(url)}</span>`));
        // var copyBtn = $(`<button class="btn btn-info btn-xs" title="Copy URL"><i class="fa fa-copy"></i></button>`);
        // copyBtn.click(function (e) {
        //     e.stopPropagation();
        //     window.copyToClipboard(url, this);
        // });
        // urlCell.append(copyBtn);
        tr.append(urlCell);

        // Final Destination (Redirect URL) Column
        tr.append($("<td>").html(`<div style="word-break: break-all;">${escapeHtml(redirectDisplay)}</div>`));

        // Action Column: Edit & Delete
        var actionTd = $("<td class='text-center'>");

        var editBtn = $(`<button class="btn btn-success btn-xs" style="margin-right: 5px; color: #FFF !important;" title="Edit"><i class="fa fa-pencil"></i></button>`);
        editBtn.click(function (e) {
            e.stopPropagation();
            window.openEditLureModal(id);
        });

        var delBtn = $(`<button class="btn btn-danger btn-xs" title="Delete"><i class="fa fa-trash"></i></button>`);
        delBtn.click(function (e) {
            e.stopPropagation();
            window.deleteLure(id);
        });

        actionTd.append(editBtn).append(delBtn);
        tr.append(actionTd);

        tbody.append(tr);
    });

    renderPaginationControls("lurePagination", lureCurrentPage, totalPages, "changeLurePage");
};

window.changeLurePage = function (page) {
    lureCurrentPage = page;
    window.renderLureTable();
};

$(document).off('keyup', '#lureSearch').on('keyup', '#lureSearch', function () {
    lureCurrentPage = 1;
    window.renderLureTable();
});

// Function to handle Lure Selection
window.selectLure = function (url, redirectUrl, landingUrl, rowElement, id) {
    // Update Hidden Inputs
    $("#manualLureUrl").val(url);
    $("#selectedLureId").val(id || "");
    $("#selectedLureLandingUrl").val(landingUrl || "");

    // Trigger QR generation if visible
    if ($(".qr-only").is(":visible")) {
        generateQR(url);
    }

    // Auto-fill Redirection URL logic
    // Only overwrite if tracking redirect is empty or we want to force it?
    // Let's force it as it makes sense for the chosen lure.
    if (redirectUrl) {
        $("#tracking_redirect_url").val(redirectUrl);
    }

    // UI Feedback
    $("#lureTableBody tr").removeClass("success");
    $("#lureTableBody .lure-check").removeClass("fa-check-circle-o").addClass("fa-circle-o");

    rowElement.addClass("success");
    rowElement.find(".lure-check").removeClass("fa-circle-o").addClass("fa-check-circle-o");
};

/* --- Management Functions --- */

window.openCreateLureModal = function () {
    // Auto-select the enabled phishlet (only one enabled at a time)
    var enabledModule = currentModules.find(function (m) { return m.enabled; });

    if (enabledModule) {
        $("#createLureModule").val(enabledModule.name);
    } else {
        errorFlash("No phishlet enabled. Please configure a phishlet in Step 4 first.");
        return;
    }

    $("#createLurePath").val("");
    $("#createRedirectUrl").val("");
    $("#createLureRedirector").val("");

    // Load and populate redirectors
    loadRedirectors().then(function () {
        populateRedirectorDropdown("createLureRedirector");
    });

    $('#createLureModal').modal('show');
};

window.createLure = function () {
    var module = $("#createLureModule").val();
    var path = $("#createLurePath").val();
    var redirectUrl = $("#createRedirectUrl").val();
    var redirector = $("#createLureRedirector").val();

    if (!module) { errorFlash("Please select a phishlet"); return; }

    // Close modal immediately
    $('#createLureModal').modal('hide');

    // Create
    $.ajax({
        url: '/api/simulationserver/strikes/create',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ module: module }),
        success: function (data) {
            if (data.success) {
                // If extra fields, we need to update the latest
                if (path || redirectUrl || redirector) {
                    // Slight timeout to ensure it's there
                    setTimeout(function () {
                        window.updateLatestLure(path, redirectUrl, redirector);
                    }, 500);
                } else {
                    refreshLures();
                    successFlash("Lure created!");
                }
            } else {
                errorFlash(data.error || "Failed to create lure");
            }
        },
        error: function () { errorFlash("Failed to connect to server"); }
    });
};

window.updateLatestLure = function (path, redirectUrl, redirector) {
    getStrikes().then(function (data) {
        if (data && data.success && data.data) {
            var strikes = data.data;
            if (strikes.length > 0) {
                // Sort by ID desc
                strikes.sort(function (a, b) { return b.id - a.id });
                var latest = strikes[0];

                $.ajax({
                    url: '/api/simulationserver/strikes/' + latest.id + '/edit',
                    type: 'POST',
                    contentType: 'application/json',
                    data: JSON.stringify({ path: path, redirect_url: redirectUrl, redirector: redirector }),
                    success: function () {
                        refreshLures();
                        successFlash("Lure created and updated!");
                    }
                });
            }
        }
    });
};

window.openEditLureModal = function (id) {
    // Find lure in cached data
    var lure = cachedModalData.strikes.find(function (s) { return s.id == id });
    if (!lure) return;

    $("#editLureId").val(id);
    $("#editLurePath").val(lure.lure_path || "");
    $("#editRedirectUrl").val(lure.redirect_url || "");

    // Load and populate redirectors, pre-select current value
    loadRedirectors().then(function () {
        populateRedirectorDropdown("editLureRedirector", lure.redirector || "");
    });

    $('#editLureModal').modal('show');
};

window.saveLureEdit = function () {
    var id = $("#editLureId").val();
    var path = $("#editLurePath").val();
    var redirectUrl = $("#editRedirectUrl").val();
    var redirector = $("#editLureRedirector").val();

    $.ajax({
        url: '/api/simulationserver/strikes/' + id + '/edit',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ path: path, redirect_url: redirectUrl, redirector: redirector }),
        success: function (data) {
            if (data.success) {
                $('#editLureModal').modal('hide');
                refreshLures();
                successFlash("Lure updated!");
            } else {
                errorFlash(data.error || "Failed to update");
            }
        }
    });
};

window.saveFinalDestination = function () {
    var id = $("#selectedLureId").val();
    var redirectUrl = $("#lureFinalDestination").val();

    if (!id) {
        errorFlash("No lure found to update. Please complete Step 4 first.");
        return;
    }

    if (!redirectUrl) {
        errorFlash("Please enter a Final Destination URL.");
        return;
    }

    var btn = $("#btnSaveFinalDestination");
    var originalHtml = btn.html();
    // btn.prop("disabled", true).html('<i class="fa fa-spinner fa-spin"></i> Saving...');

    $.ajax({
        url: '/api/simulationserver/strikes/' + id + '/edit',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ redirect_url: redirectUrl }),
        success: function (data) {
            btn.prop("disabled", false).html(originalHtml);
            if (data.success) {

                // Also update the hidden field often used by the campaign submission
                $("#selectedLureLandingUrl").val(redirectUrl);

            } else {
                errorFlash(data.error || "Failed to update Final Destination");
            }
        },
        error: function () {
            btn.prop("disabled", false).html(originalHtml);
            errorFlash("Server error: Failed to update Final Destination");
        }
    });
};

window.deleteLure = function (id) {
    Swal.fire({
        title: 'Are you sure?',
        text: "You won't be able to revert this!",
        type: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete it!'
    }).then(function (result) {
        if (result.value) {
            $.ajax({
                url: '/api/simulationserver/strikes/' + id,
                type: 'DELETE',
                success: function (data) {
                    refreshLures();
                    successFlash("Lure deleted");
                },
                error: function () { errorFlash("Failed to delete"); }
            });
        }
    });
};

function refreshLures() {
    getStrikes().then(function (resp) {
        if (resp && resp.success) {
            cachedModalData.strikes = resp.data;
            window.renderLureTable(resp.data);
        }
    });
}

// Redirectors functionality
var currentRedirectors = [];

function loadRedirectors() {
    return $.ajax({
        url: '/api/simulationserver/redirectors',
        type: 'GET',
        dataType: 'json'
    }).then(function (data) {
        // The simulation server returns {"redirectors": [...], "success": true}
        if (data.success && Array.isArray(data.redirectors)) {
            currentRedirectors = data.redirectors;
        } else if (Array.isArray(data)) {
            currentRedirectors = data;
        } else {
            currentRedirectors = [];
        }
        return currentRedirectors;
    }).fail(function () {
        console.error('Failed to load redirectors');
        currentRedirectors = [];
        return currentRedirectors;
    });
}

function populateRedirectorDropdown(selectId, selectedValue) {
    selectedValue = selectedValue || "";
    var select = $("#" + selectId);
    if (!select.length) return;

    // Clear existing options except the first "No Landing Page" option
    select.empty().append('<option value="">No Landing Page</option>');

    $.each(currentRedirectors, function (i, redirector) {
        var name = redirector.name || redirector;
        var opt = $('<option>', { value: name, text: name });
        if (selectedValue && name === selectedValue) {
            opt.attr('selected', 'selected');
        }
        select.append(opt);
    });
}

// Redirectors Management Modal Functions
var redirectorEditor = null;

window.openRedirectorsModal = function () {
    loadRedirectors().then(function () {
        renderRedirectorsTable();
        $("#newRedirectorName").val('');

        // Initialize CKEditor if not already done
        if (!redirectorEditor && CKEDITOR) {
            $("#newRedirectorHtml").ckeditor(function () {
                redirectorEditor = this;
                this.setData('');
            }, {
                height: 200,
                allowedContent: true,
                extraAllowedContent: '*(*);*{*}',
                fullPage: true
            });
        } else if (redirectorEditor) {
            redirectorEditor.setData('');
        }

        $('#redirectorsModal').modal('show');
    });
};

function renderRedirectorsTable() {
    var tbody = $("#redirectorsTableBody");
    tbody.empty();

    if (currentRedirectors.length === 0) {
        tbody.html('<tr><td colspan="2" class="text-center">No redirectors found.</td></tr>');
        return;
    }

    $.each(currentRedirectors, function (i, redirector) {
        var name = redirector.name || redirector;
        var tr = $('<tr>');
        tr.append($('<td>').html('<code>' + escapeHtml(name) + '</code>'));
        tr.append($('<td class="text-center">').html(
            '<button class="btn btn-danger btn-xs" onclick="deleteRedirector(\'' + name + '\')" title="Delete">' +
            '<i class="fa fa-trash"></i></button>'
        ));
        tbody.append(tr);
    });
}

window.createNewRedirector = function () {
    var name = $("#newRedirectorName").val().trim();
    var html = redirectorEditor ? redirectorEditor.getData() : $("#newRedirectorHtml").val();

    if (!name) { errorFlash("Please enter a name for the redirector"); return; }
    if (!html) { errorFlash("Please enter HTML content for the redirector"); return; }

    // Validate name (no spaces)
    if (/\s/.test(name)) { errorFlash("Name cannot contain spaces"); return; }

    $.ajax({
        url: '/api/simulationserver/redirectors',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ name: name, html: html }),
        success: function (data) {
            if (data.success) {
                successFlash("Redirector created successfully!");
                $("#newRedirectorName").val('');
                if (redirectorEditor) {
                    redirectorEditor.setData('');
                }

                // Reload redirectors and update table and dropdowns
                loadRedirectors().then(function () {
                    renderRedirectorsTable();
                    populateRedirectorDropdown('createLureRedirector', name);
                    populateRedirectorDropdown('editLureRedirector');
                });
            } else {
                errorFlash(data.message || data.error || "Failed to create redirector");
            }
        },
        error: function () {
            errorFlash("Failed to connect to server");
        }
    });
};

window.deleteRedirector = function (name) {
    if (!confirm('Are you sure you want to delete redirector "' + name + '"?')) return;

    $.ajax({
        url: '/api/simulationserver/redirectors/' + encodeURIComponent(name),
        type: 'DELETE',
        success: function (data) {
            if (data.success) {
                successFlash("Redirector deleted successfully!");

                // Reload redirectors and update table and dropdowns
                loadRedirectors().then(function () {
                    renderRedirectorsTable();
                    populateRedirectorDropdown('createLureRedirector');
                    populateRedirectorDropdown('editLureRedirector');
                });
            } else {
                errorFlash(data.message || data.error || "Failed to delete redirector");
            }
        },
        error: function () {
            errorFlash("Failed to connect to server");
        }
    });
};

window.copyToClipboard = function (text, btn) {
    var textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        var icon = $(btn).find('i');
        var oldClass = icon.attr('class');
        icon.attr('class', 'fa fa-check');
        setTimeout(function () { icon.attr('class', oldClass); }, 1500);
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }
    document.body.removeChild(textArea);
};

/* --- Group Table Logic --- */

var allGroups = [];
var currentGroupFilter = 'all';
var groupCurrentPage = 1;
var groupItemsPerPage = 6;
var currentFilteredGroups = [];

// Called from setupOptions or when groups update
window.renderGroupTable = function (groups) {
    if (groups) allGroups = groups;
    else groups = allGroups;

    var tbody = $("#groupTableBody");
    tbody.empty();

    // Filter
    var filtered = groups.filter(function (g) {
        if (currentGroupFilter == 'all') return true;
        var type = g.group_type || 'email'; // fallback
        return type.toLowerCase() === currentGroupFilter;
    });

    var search = $("#groupSearch").val() ? $("#groupSearch").val().toLowerCase() : "";
    if (search) {
        filtered = filtered.filter(function (g) {
            return g.name.toLowerCase().indexOf(search) > -1;
        });
    }

    currentFilteredGroups = filtered;
    var totalPages = Math.ceil(filtered.length / groupItemsPerPage);
    if (groupCurrentPage > totalPages) groupCurrentPage = 1;
    if (groupCurrentPage < 1) groupCurrentPage = 1;

    var start = (groupCurrentPage - 1) * groupItemsPerPage;
    var end = start + groupItemsPerPage;
    var pageItems = filtered.slice(start, end);

    if (filtered.length === 0) {
        tbody.append('<tr><td colspan="7" class="text-center">No groups found.</td></tr>');
        $("#groupPagination").hide();
        return;
    }

    // Populate hidden select for validation compatibility
    var userSelect = $("#users");

    $.each(pageItems, function (i, g) {
        var tr = $("<tr>");
        tr.css("cursor", "pointer");
        var isSelected = isGroupSelected(g.name);

        if (isSelected) tr.addClass("success");

        tr.click(function (e) {
            if ($(e.target).closest('button').length) return;
            toggleGroupSelection(g.name, tr);
        });

        // Checkbox column
        var checkIcon = isSelected ? "fa-check-square-o" : "fa-square-o";
        tr.append($("<td class='text-center'>").html(`<i class="fa ${checkIcon} group-check"></i>`));

        tr.append($("<td>").text(g.name));

        // Type Badge
        var type = (g.group_type || 'EMAIL').toUpperCase();
        var labelClass = 'label-success';
        if (type === 'SMS') labelClass = 'label-info';
        if (type === 'QR') labelClass = 'label-primary';
        tr.append($("<td class='text-center'>").html(`<span class="label ${labelClass}" style="font-size: 11px;">${type}</span>`));

        tr.append($("<td>").text("admin"));
        tr.append($("<td class='text-center'>").text(g.targets ? g.targets.length : (g.num_targets || 0)));

        var dateStr = g.modified_date ? moment(g.modified_date).format('MMMM Do YYYY, h:mm:ss a') : "-";
        tr.append($("<td>").text(dateStr));

        // Actions
        var actionTd = $("<td class='text-right'>");
        // Edit
        var editBtn = $(`<button class="btn btn-success btn-xs" style="margin-right: 5px; color: #FFF !important;"><i class="fa fa-pencil"></i></button>`);
        editBtn.click(function (e) {
            e.stopPropagation();
            window.editGroup(g.id);
        });

        // Delete
        var delBtn = $(`<button class="btn btn-danger btn-xs"><i class="fa fa-trash"></i></button>`);
        delBtn.click(function (e) {
            e.stopPropagation();
            Swal.fire({
                title: 'Are you sure?',
                text: "Delete group " + g.name + "?",
                type: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                confirmButtonText: 'Yes, delete!'
            }).then(function (result) {
                if (result.value) {
                    api.groupId.delete(g.id).done(function () {
                        api.groups.summary().done(function (data) {
                            allGroups = data.groups;
                            window.renderGroupTable();
                        });
                        successFlash("Group deleted");
                    });
                }
            });
        });

        actionTd.append(editBtn).append(delBtn);
        tr.append(actionTd);

        tbody.append(tr);
    });

    renderPaginationControls("groupPagination", groupCurrentPage, totalPages, "changeGroupPage");
};

window.changeGroupPage = function (page) {
    groupCurrentPage = page;
    window.renderGroupTable();
};

window.filterGroups = function (type) {
    currentGroupFilter = type;
    groupCurrentPage = 1;
    window.renderGroupTable();
};

$("#groupSearch").on("keyup", function () {
    groupCurrentPage = 1;
    window.renderGroupTable();
});


function isGroupSelected(name) {
    var vals = $("#users").val() || [];
    return vals.includes(name);
}

function toggleGroupSelection(name, tr) {
    var select = $("#users");
    var currentVals = select.val() || [];
    var index = currentVals.indexOf(name);

    // Ensure option exists in select
    if (select.find("option[value='" + name + "']").length === 0) {
        select.append(new Option(name, name));
    }

    if (index > -1) {
        // Deselect
        currentVals.splice(index, 1);
        tr.removeClass("success");
        tr.find(".group-check").removeClass("fa-check-square-o").addClass("fa-square-o");
    } else {
        // Select
        currentVals.push(name);
        tr.addClass("success");
        tr.find(".group-check").removeClass("fa-square-o").addClass("fa-check-square-o");
    }

    select.val(currentVals).trigger("change");
}

// --- Profile Management ---

window.currentEditingProfileId = null;

window.openCreateProfileModal = function () {
    window.currentEditingProfileId = null;
    $("#createProfileModalLabel").text("New Sending Profile");

    // Determine type
    var cType = $("#campaign_type").val();
    var pType = (cType == 'sms') ? 'SMS' : 'SMTP';

    $("#modal_profile_interface_type").val(pType);
    $("#modal_profile_name").val("");

    // Clear fields
    $("#modal_smtp_from, #modal_smtp_host, #modal_smtp_username, #modal_smtp_password").val("");
    $("#modal_sms_account_sid, #modal_sms_auth_token, #modal_sms_from").val("");

    // Show correct fields
    if (pType == 'SMS') {
        $("#modal_smtp_fields").hide();
        $("#modal_sms_fields").show();
    } else {
        $("#modal_sms_fields").hide();
        $("#modal_smtp_fields").show();
    }

    $("#createProfileModal").modal("show");
};

window.editProfile = function (id, type) {
    window.currentEditingProfileId = id;
    $("#createProfileModalLabel").text("Edit Sending Profile");
    $("#modal_profile_interface_type").val(type);

    // Fetch details
    var apiCall = (type == 'SMS') ? api.SMSId.get(id) : api.SMTPId.get(id);

    apiCall.done(function (p) {
        $("#modal_profile_name").val(p.name);

        if (type == 'SMS') {
            $("#modal_sms_fields").show(); $("#modal_smtp_fields").hide();
            $("#modal_sms_account_sid").val(p.username);
            $("#modal_sms_auth_token").val(p.password);
            $("#modal_sms_from").val(p.from_address);
        } else {
            $("#modal_sms_fields").hide(); $("#modal_smtp_fields").show();
            $("#modal_smtp_from").val(p.from_address);
            $("#modal_smtp_host").val(p.host);
            $("#modal_smtp_username").val(p.username);
            $("#modal_smtp_ignore_cert_errors").prop("checked", p.ignore_cert_errors);
        }
        $("#createProfileModal").modal("show");
    }).fail(function () {
        errorFlash("Failed to fetch profile details.");
    });
};

window.copyProfile = function (id, type) {
    window.currentEditingProfileId = null; // Create mode
    $("#createProfileModalLabel").text("Copy Sending Profile");
    $("#modal_profile_interface_type").val(type);

    // Fetch details
    var apiCall = (type == 'SMS') ? api.SMSId.get(id) : api.SMTPId.get(id);

    apiCall.done(function (p) {
        $("#modal_profile_name").val("Copy of " + p.name);

        if (type == 'SMS') {
            $("#modal_sms_fields").show(); $("#modal_smtp_fields").hide();
            $("#modal_sms_account_sid").val(p.username);
            $("#modal_sms_auth_token").val(p.password);
            $("#modal_sms_from").val(p.from_address);
        } else {
            $("#modal_sms_fields").hide(); $("#modal_smtp_fields").show();
            $("#modal_smtp_from").val(p.from_address);
            $("#modal_smtp_host").val(p.host);
            $("#modal_smtp_username").val(p.username);
            $("#modal_smtp_ignore_cert_errors").prop("checked", p.ignore_cert_errors);
        }
        $("#createProfileModal").modal("show");
    }).fail(function () {
        errorFlash("Failed to fetch profile details for copy.");
    });
};

window.deleteProfile = function (id, type, name) {
    Swal.fire({
        title: 'Are you sure?',
        text: "Delete profile " + name + "?",
        type: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete!'
    }).then(function (result) {
        if (result.value) {
            var apiCall = (type == 'SMS') ? api.SMSId.delete(id) : api.SMTPId.delete(id);
            apiCall.done(function () {
                setupOptions(true).then(function () {
                    successFlash("Profile deleted");
                });
            });
        }
    });
};

$("#modal_saveProfileSubmit").click(function () {
    var id = window.currentEditingProfileId;
    var type = $("#modal_profile_interface_type").val();
    var name = $("#modal_profile_name").val();

    if (!name) {
        $("#modal_profile_flashes").html("<div class='alert alert-danger'>Name is required</div>");
        return;
    }

    var data = {
        name: name,
        interface_type: type
    };

    if (id) data.id = parseInt(id);

    if (type == 'SMS') {
        data.username = $("#modal_sms_account_sid").val();
        data.password = $("#modal_sms_auth_token").val();
        data.from_address = $("#modal_sms_from").val();
    } else {
        data.from_address = $("#modal_smtp_from").val();
        data.host = $("#modal_smtp_host").val();
        data.username = $("#modal_smtp_username").val();
        var pwd = $("#modal_smtp_password").val();
        if (pwd) data.password = pwd;
        data.ignore_cert_errors = $("#modal_smtp_ignore_cert_errors").is(":checked");
    }

    var btn = $(this);
    var originalText = btn.html();
    btn.prop("disabled", true).html("<i class='fa fa-spinner fa-spin'></i> Saving...");

    var promise;
    if (type == 'SMS') {
        promise = id ? api.SMSId.put(data) : api.SMS.post(data);
    } else {
        promise = id ? api.SMTPId.put(data) : api.SMTP.post(data);
    }

    promise.done(function () {
        btn.prop("disabled", false).html(originalText);
        $("#createProfileModal").modal("hide");
        setupOptions(true).then(function () {
            successFlash("Profile saved!");
        });
    }).fail(function (xhr) {
        btn.prop("disabled", false).html(originalText);
        var msg = (xhr.responseJSON && xhr.responseJSON.message) ? xhr.responseJSON.message : "Error saving profile";
        $("#modal_profile_flashes").html("<div class='alert alert-danger'>" + msg + "</div>");
    });
});

function provisionSSLCertificate(domain, zoneId, phishlet) {
    var $container = $("#ssl-status-container");
    var $text = $("#ssl-status-text");
    var $loader = $("#ssl-loader");

    if (!domain) return;  // Backend will handle zoneId fallback

    $container.show();
    $text.text("Provisioning SSL...").css("color", "#666");
    $loader.show();

    $.ajax({
        url: "/api/simulationserver/config/certificate",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({
            domain: domain,
            zone_id: zoneId,
            phishlet: phishlet
        }),
        success: function (response) {
            $loader.hide();
            if (response.success) {
                $text.text("SSL Ready ✅").css("color", "green");
                Toast.fire({
                    icon: 'success',
                    title: 'SSL Certificate provisioned successfully'
                });
            } else {
                $text.text("SSL Failed ❌").css("color", "red");
                console.error("SSL Provisioning failed:", response.message);
            }
        },
        error: function (xhr) {
            $loader.hide();
            $text.text("SSL Error ❌").css("color", "red");
            console.error("SSL Provisioning API error:", xhr.responseText);
        }
    });
}

function provisionRedirectorSSL(domain, phishlet) {
    var $container = $("#redirector-ssl-status-container");
    var $text = $("#redirector-ssl-status-text");
    var $loader = $("#redirector-ssl-loader");

    if (!domain) return;

    $container.show();
    $text.text("Provisioning SSL...").css("color", "#666");
    $loader.show();

    $.ajax({
        url: "/api/simulationserver/config/certificate",
        method: "POST",
        contentType: "application/json",
        data: JSON.stringify({
            domain: domain,
            zone_id: "",
            phishlet: ""
        }),
        success: function (response) {
            $loader.hide();
            if (response.success) {
                $text.text("SSL Ready ✅").css("color", "green");

            } else {
                $text.text("SSL Failed ❌").css("color", "red");
                console.error("Redirector SSL Provisioning failed:", response.message);
            }
        },
        error: function (xhr) {
            $loader.hide();
            $text.text("SSL Error ❌").css("color", "red");
            console.error("Redirector SSL Provisioning API error:", xhr.responseText);
        }
    });
}
