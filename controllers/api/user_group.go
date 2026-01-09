package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/trust_strike/trust_strike/models"
)

// UserGroups returns a list of user groups.
func (as *Server) UserGroups(w http.ResponseWriter, r *http.Request) {
	switch {
	case r.Method == "GET":
		gs, err := models.GetUserGroups()
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, gs, http.StatusOK)
	case r.Method == "POST":
		g := models.UserGroup{}
		err := json.NewDecoder(r.Body).Decode(&g)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
			return
		}
		err = models.PostUserGroup(&g)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, g, http.StatusCreated)
	}
}

// UserGroup handles requests for a specific user group.
func (as *Server) UserGroup(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, _ := strconv.ParseInt(vars["id"], 0, 64)
	switch {
	case r.Method == "GET":
		g, err := models.GetUserGroup(id)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: "User group not found"}, http.StatusNotFound)
			return
		}
		JSONResponse(w, g, http.StatusOK)
	case r.Method == "DELETE":
		err := models.DeleteUserGroup(id)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, models.Response{Success: true, Message: "User group deleted successfully"}, http.StatusOK)
	}
}

// UserGroupMembers handles adding or removing users from a user group.
func (as *Server) UserGroupMembers(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gid, _ := strconv.ParseInt(vars["id"], 0, 64)

	switch {
	case r.Method == "POST":
		var req struct {
			UserID int64 `json:"user_id"`
		}
		err := json.NewDecoder(r.Body).Decode(&req)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusBadRequest)
			return
		}
		err = models.AddUserToGroup(req.UserID, gid)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, models.Response{Success: true, Message: "User added to group"}, http.StatusOK)
	}
}

// UserGroupMember handles removing a user from a group.
func (as *Server) UserGroupMember(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	gid, _ := strconv.ParseInt(vars["id"], 0, 64)
	uid, _ := strconv.ParseInt(vars["user_id"], 0, 64)

	if r.Method == "DELETE" {
		err := models.RemoveUserFromGroup(uid, gid)
		if err != nil {
			JSONResponse(w, models.Response{Success: false, Message: err.Error()}, http.StatusInternalServerError)
			return
		}
		JSONResponse(w, models.Response{Success: true, Message: "User removed from group"}, http.StatusOK)
	}
}
