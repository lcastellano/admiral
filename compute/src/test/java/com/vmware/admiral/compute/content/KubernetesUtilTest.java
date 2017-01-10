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

package com.vmware.admiral.compute.content;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;

import static com.vmware.admiral.compute.content.CompositeTemplateUtil.assertContainersComponentsOnly;
import static com.vmware.admiral.compute.content.CompositeTemplateUtil.deserializeCompositeTemplate;
import static com.vmware.admiral.compute.content.CompositeTemplateUtil.serializeCompositeTemplate;
import static com.vmware.admiral.compute.content.CompositeTemplateUtilTest.assertContainersComponents;
import static com.vmware.admiral.compute.content.CompositeTemplateUtilTest.getContent;
import static com.vmware.admiral.compute.content.kubernetes.KubernetesUtil.deserializeKubernetesEntity;
import static com.vmware.admiral.compute.content.kubernetes.KubernetesUtil.fromPodContainerProbeToCompositeComponentHealthConfig;
import static com.vmware.admiral.compute.content.kubernetes.KubernetesUtil.fromPodToCompositeTemplate;

import java.io.IOException;

import org.junit.Test;

import com.vmware.admiral.compute.ResourceType;
import com.vmware.admiral.compute.container.ComputeBaseTest;
import com.vmware.admiral.compute.container.HealthChecker.HealthConfig;
import com.vmware.admiral.compute.container.HealthChecker.HealthConfig.HttpVersion;
import com.vmware.admiral.compute.container.HealthChecker.HealthConfig.RequestProtocol;
import com.vmware.admiral.compute.content.kubernetes.Pod;
import com.vmware.admiral.compute.content.kubernetes.PodContainer;
import com.vmware.admiral.compute.content.kubernetes.PodContainerProbe;
import com.vmware.admiral.compute.content.kubernetes.PodContainerProbeHTTPGetAction;
import com.vmware.admiral.compute.content.kubernetes.PodContainerProbeTCPSocketAction;
import com.vmware.xenon.common.Service.Action;

public class KubernetesUtilTest extends ComputeBaseTest {

    @Test
    public void testConvertKubernetesPodToCompositeTemplate() throws IOException {
        CompositeTemplate expectedTemplate = deserializeCompositeTemplate(
                getContent("composite.nginx-mysql.yaml"));

        String expectedTemplateYaml = serializeCompositeTemplate(expectedTemplate);

        Pod pod = (Pod) deserializeKubernetesEntity(getContent("kubernetes.nginx-mysql.yaml"));
        CompositeTemplate actualTemplate = fromPodToCompositeTemplate(pod);

        assertContainersComponentsOnly(actualTemplate.components);

        assertContainersComponents(ResourceType.CONTAINER_TYPE.getContentType(), 2,
                actualTemplate.components);
        assertContainersComponents(ResourceType.CONTAINER_NETWORK_TYPE.getContentType(), 0,
                actualTemplate.components);
        assertContainersComponents(ResourceType.CONTAINER_VOLUME_TYPE.getContentType(), 0,
                actualTemplate.components);

        String actualTemplateYaml = serializeCompositeTemplate(actualTemplate);

        assertEquals(expectedTemplateYaml, actualTemplateYaml);
    }

    @Test
    public void testConvertPodContainerProbeToHealthConfigTCP() {
        PodContainer podContainer = new PodContainer();
        podContainer.livenessProbe = new PodContainerProbe();
        podContainer.livenessProbe.tcpSocket = new PodContainerProbeTCPSocketAction();
        podContainer.livenessProbe.tcpSocket.port = "8080";
        podContainer.livenessProbe.timeoutSeconds = 3L;

        HealthConfig expectedHealthConfig = new HealthConfig();
        expectedHealthConfig.protocol = RequestProtocol.TCP;
        expectedHealthConfig.port = 8080;
        expectedHealthConfig.timeoutMillis = 3000;

        HealthConfig actualHealthConfig = fromPodContainerProbeToCompositeComponentHealthConfig
                (podContainer);

        assertNotNull(actualHealthConfig);
        assertEquals(actualHealthConfig.protocol, expectedHealthConfig.protocol);
        assertEquals(actualHealthConfig.port, expectedHealthConfig.port);
        assertEquals(actualHealthConfig.timeoutMillis, expectedHealthConfig.timeoutMillis);
    }

    @Test
    public void testConvertPodContainerProbeToHealthConfigHTTP() {
        PodContainer podContainer = new PodContainer();
        podContainer.livenessProbe = new PodContainerProbe();
        podContainer.livenessProbe.httpGet = new PodContainerProbeHTTPGetAction();
        podContainer.livenessProbe.httpGet.port = "8080";
        podContainer.livenessProbe.httpGet.path = "/health";
        podContainer.livenessProbe.timeoutSeconds = 3L;

        HealthConfig expectedHealthConfig = new HealthConfig();
        expectedHealthConfig.protocol = RequestProtocol.HTTP;
        expectedHealthConfig.httpVersion = HttpVersion.HTTP_v1_1;
        expectedHealthConfig.httpMethod = Action.GET;
        expectedHealthConfig.urlPath = "/health";
        expectedHealthConfig.port = 8080;
        expectedHealthConfig.timeoutMillis = 3000;

        HealthConfig actualHealthConfig = fromPodContainerProbeToCompositeComponentHealthConfig
                (podContainer);

        assertNotNull(actualHealthConfig);
        assertEquals(actualHealthConfig.protocol, expectedHealthConfig.protocol);
        assertEquals(actualHealthConfig.port, expectedHealthConfig.port);
        assertEquals(actualHealthConfig.httpMethod, expectedHealthConfig.httpMethod);
        assertEquals(actualHealthConfig.httpVersion, expectedHealthConfig.httpVersion);
        assertEquals(actualHealthConfig.urlPath, expectedHealthConfig.urlPath);
        assertEquals(actualHealthConfig.timeoutMillis, expectedHealthConfig.timeoutMillis);
    }
}