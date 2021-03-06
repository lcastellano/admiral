/*
 * Copyright (c) 2016 VMware, Inc. All Rights Reserved.
 *
 * This product is licensed to you under the Apache License, Version 2.0 (the "License").
 * You may not use this product except in compliance with the License.
 *
 * This product may include a number of subcomponents with separate copyright notices
 * and license terms. Your use of these subcomponents is subject to the terms and
 * conditions of the subcomponent's license, as noted in the LICENSE file.
 */

package deplPolicy

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"admiral/client"
	"admiral/config"
	"admiral/utils"
	"admiral/utils/selflink"
	"admiral/utils/urlutils"
)

var (
	DeploymentPolicyNotFoundError        = errors.New("Deployment policy not found.")
	DuplicateNamesError                  = errors.New("Duplicates with that name found. Please provide the ID for the specific deployment policy.")
	DeploymentPolicyNameNotProvidedError = errors.New("Deployment policy name not provided.")
)

type DeploymentPolicy struct {
	Name             string  `json:"name,omitempty"`
	Description      string  `json:"description,omitempty"`
	DocumentSelfLink *string `json:"documentSelfLink,omitempty"`
}

//GetID returns the ID of the deployment policy as string.
func (dp *DeploymentPolicy) GetID() string {
	return strings.Replace(*dp.DocumentSelfLink, "/resources/deployment-policies/", "", -1)
}

type DeploymentPolicyList struct {
	DocumentLinks []string                    `json:"documentLinks"`
	Documents     map[string]DeploymentPolicy `json:"documents"`
}

func (dpl *DeploymentPolicyList) GetCount() int {
	return len(dpl.DocumentLinks)
}

func (dpl *DeploymentPolicyList) GetResource(index int) selflink.Identifiable {
	resource := dpl.Documents[dpl.DocumentLinks[index]]
	return &resource
}

func (dpl *DeploymentPolicyList) Renew() {
	*dpl = DeploymentPolicyList{}
}

//FetchDP fetches existing deployment policies and returns their count.
func (dpl *DeploymentPolicyList) FetchDP() (int, error) {
	url := urlutils.BuildUrl(urlutils.DeploymentPolicy, urlutils.GetCommonQueryMap(), true)
	req, _ := http.NewRequest("GET", url, nil)
	_, respBody, respErr := client.ProcessRequest(req)
	if respErr != nil {
		return 0, respErr
	}
	err := json.Unmarshal(respBody, dpl)
	utils.CheckBlockingError(err)
	return len(dpl.DocumentLinks), nil
}

//Print prints already fetched deployment policies.
func (dpl *DeploymentPolicyList) GetOutputString() string {
	if dpl.GetCount() < 1 {
		return utils.NoElementsFoundMessage
	}
	var buffer bytes.Buffer
	buffer.WriteString("ID\tNAME\tDESCRIPTION")
	buffer.WriteString("\n")
	for _, link := range dpl.DocumentLinks {
		val := dpl.Documents[link]
		output := utils.GetTabSeparatedString(val.GetID(), val.Name, val.Description)
		buffer.WriteString(output)
		buffer.WriteString("\n")
	}
	return strings.TrimSpace(buffer.String())
}

//RemoveDP removes deployment policy by name. Returns the ID of the removed
//deployment policy and error which is != nil if none or more than one
//deployment policies are found or if the response code is different from 200.
func RemoveDP(name string) (string, error) {
	links := GetDPLinks(name)
	if len(links) > 1 {
		return "", DuplicateNamesError
	} else if len(links) < 1 {
		return "", DeploymentPolicyNotFoundError
	}
	id := utils.GetResourceID(links[0])
	return RemoveDPID(id)
}

//RemoveDPID deployment policy by ID. Returns the ID of the removed
//deployment policy and error which is != nil if the response code is different
//from 200.
func RemoveDPID(id string) (string, error) {
	fullId, err := selflink.GetFullId(id, new(DeploymentPolicyList), utils.DEPLOYMENT_POLICY)
	utils.CheckBlockingError(err)
	link := utils.CreateResLinkForDeploymentPolicies(fullId)
	url := config.URL + link
	req, _ := http.NewRequest("DELETE", url, nil)
	_, _, respErr := client.ProcessRequest(req)
	if respErr != nil {
		return "", respErr
	}
	return fullId, nil
}

//AddDP adds deployment policy by provided name and description.
//Returns the ID of the added deployment policy and error which is
//!= nil if the name or description strings is empty string or if the
//response code is different from 200.
func AddDP(dpName, dpDescription string) (string, error) {
	url := urlutils.BuildUrl(urlutils.DeploymentPolicy, nil, true)
	if dpName == "" {
		return "", DeploymentPolicyNameNotProvidedError
	}
	dp := &DeploymentPolicy{
		Name:             dpName,
		Description:      dpDescription,
		DocumentSelfLink: nil,
	}
	jsonBody, err := json.Marshal(dp)
	utils.CheckBlockingError(err)

	req, _ := http.NewRequest("POST", url, bytes.NewBuffer(jsonBody))
	_, respBody, respErr := client.ProcessRequest(req)
	if respErr != nil {
		return "", respErr
	}
	dp = &DeploymentPolicy{}
	err = json.Unmarshal(respBody, dp)
	utils.CheckBlockingError(err)
	return dp.GetID(), nil
}

//EditDP edits deployment policy. The parameters that functions takes are
//the name of desired deployment policy to edit, the new name and the new description.
//Pass empty string in case you want to modify some property. Returns the ID of edited
//deployment policy and error which is != nil if none or one or more deployment policies
//have the same name or if the response code is different from 200.
func EditDP(dpName, newName, newDescription string) (string, error) {
	links := GetDPLinks(dpName)
	if len(links) > 1 {
		return "", DuplicateNamesError
	} else if len(links) < 1 {
		return "", DeploymentPolicyNotFoundError
	}
	id := utils.GetResourceID(links[0])
	return EditDPID(id, newName, newDescription)
}

//EditDPID edits deployment policy by ID. The parameters that function takes are
//the ID of desired deployment policy to edit, the new name and the new description.
//Pass empty string in case you want to modify some property. Returns the ID of edited
//deployment policy and error which is != nil if the response code is different from 200.
func EditDPID(id, newName, newDescription string) (string, error) {
	fullId, err := selflink.GetFullId(id, new(DeploymentPolicyList), utils.DEPLOYMENT_POLICY)
	utils.CheckBlockingError(err)
	url := config.URL + utils.CreateResLinkForDeploymentPolicies(fullId)
	dp := &DeploymentPolicy{
		Name:             newName,
		Description:      newDescription,
		DocumentSelfLink: nil,
	}
	jsonBody, err := json.Marshal(dp)
	utils.CheckBlockingError(err)
	req, _ := http.NewRequest("PATCH", url, bytes.NewBuffer(jsonBody))
	_, respBody, respErr := client.ProcessRequest(req)
	if respErr != nil {
		return "", respErr
	}
	dp = &DeploymentPolicy{}
	err = json.Unmarshal(respBody, dp)
	utils.CheckBlockingError(err)
	return dp.GetID(), nil
}

//Checks if either the name or the description are empty strings.
func checkNameDesc(dpName, dpDescription string) bool {
	if dpName == "" || len(dpDescription) < 1 {
		return false
	}
	return true
}

//GetDPLinks takes deployment policy name as parameter.
//Return array of self links of deployment policies with the same name.
func GetDPLinks(name string) []string {
	dpl := DeploymentPolicyList{}
	dpl.FetchDP()
	links := make([]string, 0)
	for _, dp := range dpl.DocumentLinks {
		val := dpl.Documents[dp]
		if name == val.Name {
			links = append(links, dp)
		}
	}

	return links
}

//GetDPName takes deployment policy self link as parameter and returns it's name.
func GetDPName(link string) string {
	fullId, err := selflink.GetFullId(link, new(DeploymentPolicyList), utils.DEPLOYMENT_POLICY)
	utils.CheckBlockingError(err)
	url := config.URL + utils.CreateResLinkForDeploymentPolicies(fullId)
	req, _ := http.NewRequest("GET", url, nil)
	_, respBody, respErr := client.ProcessRequest(req)
	utils.CheckBlockingError(respErr)
	dp := &DeploymentPolicy{}
	//Ignoring error, because default deployment policy is crashing
	_ = json.Unmarshal(respBody, dp)
	//functions.CheckJson(err)
	return dp.Name
}
